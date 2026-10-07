import { BskyAgent, RichText } from "@atproto/api"
import type { AppBskyEmbedExternal, AppBskyFeedPost } from "@atproto/api"
import { fetchPublicPreview } from "./public-fetch"

let agent: BskyAgent | null = null

async function getAgent() {
  if (agent) return agent

  const identifier = process.env.BLUESKY_IDENTIFIER
  const password = process.env.BLUESKY_PASSWORD

  if (!identifier || !password) {
    console.error("[Bsky] Credentials missing from process.env")
    throw new Error("Bluesky credentials not configured")
  }

  agent = new BskyAgent({ service: "https://bsky.social" })
  await agent.login({ identifier, password })

  return agent
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function extractMeta(html: string, attr: "property" | "name", value: string): string {
  // Match <meta property="value" content="..."> in any attribute order
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']*?)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+${attr}=["']${value}["']`, "i"),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
  }
  return ""
}

export async function fetchLinkCard(url: string | undefined, _agent: BskyAgent, signal?: AbortSignal) {
  if (!url) return null
  try {
    signal?.throwIfAborted()
    const res = await fetchPublicPreview(url, 1024 * 1024, ["text/html", "application/xhtml+xml"])
    signal?.throwIfAborted()
    const html = res.body.toString("utf8")

    const title =
      extractMeta(html, "property", "og:title") ||
      extractMeta(html, "name", "twitter:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      url

    const description =
      extractMeta(html, "property", "og:description") ||
      extractMeta(html, "name", "twitter:description") ||
      extractMeta(html, "name", "description") ||
      ""

    const imageUrl =
      extractMeta(html, "property", "og:image") ||
      extractMeta(html, "name", "twitter:image")

    let thumb: AppBskyEmbedExternal.External["thumb"] = undefined
    if (imageUrl) {
      try {
        const imgRes = await fetchPublicPreview(new URL(imageUrl, res.url).href, 1_000_000,
          ["image/jpeg", "image/png", "image/webp", "image/gif"])
        signal?.throwIfAborted()
        const uploaded = await _agent.uploadBlob(new Uint8Array(imgRes.body), { encoding: imgRes.contentType })
        thumb = uploaded.data.blob
      } catch {
        console.error("[Bsky] Thumbnail upload failed:")
      }
    }

    return { uri: url, title, description, thumb }
  } catch {
    console.error("[Bsky] fetchLinkCard failed:")
    return null
  }
}

async function prepareRichText(text: string) {
  const _agent = await getAgent()

  const MAX_CHARS = 300
  const finalText = text.length > MAX_CHARS ? text.slice(0, 297).trimEnd() + "..." : text

  const rt = new RichText({ text: finalText })
  await rt.detectFacets(_agent)
  return rt
}

export async function postToBluesky(text: string, linkUrl?: string) {
  try {
    const _agent = await getAgent()
    const [rt, card] = await Promise.all([
      prepareRichText(text),
      fetchLinkCard(linkUrl, _agent),
    ])

    const record: AppBskyFeedPost.Record = {
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    }

    if (card) {
      record.embed = { $type: "app.bsky.embed.external", external: card }
    }

    const res = await _agent.post(record)
    return { uri: res.uri, cid: res.cid }
  } catch {
    console.error("Failed to post to Bluesky:")
    return null
  }
}

export async function updateBlueskyPost(uri: string, _cid: string, text: string, linkUrl?: string) {
  try {
    const _agent = await getAgent()


    const [rt, card] = await Promise.all([
      prepareRichText(text),
      fetchLinkCard(linkUrl, _agent),
    ])


    const uriParts = uri.replace("at://", "").split("/")
    const repo = uriParts[0]
    const collection = uriParts[1]
    const rkey = uriParts[2]


    const record: AppBskyFeedPost.Record = {
      $type: "app.bsky.feed.post",
      text: rt.text,
      createdAt: new Date().toISOString(),
    }
    if (rt.facets?.length) record.facets = rt.facets
    if (card) record.embed = { $type: "app.bsky.embed.external", external: card }

    // Preserve original createdAt
    try {
      const orig = await _agent.com.atproto.repo.getRecord({ repo, collection, rkey })
      const original = orig.data.value
      if (original && typeof original === "object" && "createdAt" in original && typeof original.createdAt === "string") {
        record.createdAt = original.createdAt

      }
    } catch {
      // Legacy edit helper retains its fallback timestamp.
    }

    const res = await _agent.com.atproto.repo.putRecord({ repo, collection, rkey, record })

    return { uri: res.data.uri, cid: res.data.cid }
  } catch {
    console.error("[Bsky] updateBlueskyPost failed:")
    return null
  }
}

export async function deleteBlueskyPost(uri: string) {
  try {
    const _agent = await getAgent()
    await _agent.deletePost(uri)
    return true
  } catch {
    console.error("Failed to delete Bluesky post:")
    return false
  }
}

export interface BlueskyStats {
  likeCount: number
  replyCount: number
  repostCount: number
}

export async function getBlueskyStats(uris: string[]): Promise<Record<string, BlueskyStats>> {
  if (uris.length === 0) return {}

  try {
    const _agent = await getAgent()
    // getPosts supports up to 25 URIs at a time
    const res = await _agent.getPosts({ uris })

    const stats: Record<string, BlueskyStats> = {}
    res.data.posts.forEach((post) => {
      stats[post.uri] = {
        likeCount: post.likeCount ?? 0,
        replyCount: post.replyCount ?? 0,
        repostCount: post.repostCount ?? 0,
      }
    })

    return stats
  } catch {
    console.error("Failed to fetch Bluesky stats:")
    return {}
  }
}

export function getPublicPostUrl(uri: string) {
  const parts = uri.replace("at://", "").split("/")
  const repo = parts[0]
  const rkey = parts[2]
  return `https://bsky.app/profile/${repo}/post/${rkey}`
}
