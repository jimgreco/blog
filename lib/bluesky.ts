import { BskyAgent, RichText } from "@atproto/api"

let agent: BskyAgent | null = null

async function getAgent() {
  if (agent) return agent

  const identifier = process.env.BLUESKY_IDENTIFIER
  const password = process.env.BLUESKY_PASSWORD

  if (!identifier || !password) {
    console.error("[Bsky] Credentials missing from process.env")
    throw new Error("Bluesky credentials not configured")
  }

  console.log(`[Bsky] Attempting login for identifier: ${identifier}`)
  agent = new BskyAgent({ service: "https://bsky.social" })
  await agent.login({ identifier, password })
  console.log("[Bsky] Login successful")
  return agent
}

function stripMarkdown(body: string): string {
  // Basic markdown removal while trying to maintain spacing
  return body
    .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, "$1 ($2)") // Links: [text](url) -> text (url)
    .replace(/[\*_]{1,2}([^\*_]+)[\*_]{1,2}/g, "$1") // Bold/Italic
    .replace(/^#+\s+/gm, "") // Headers
    .replace(/`{1,3}[^`]+`{1,3}/g, "") // Code blocks
    .replace(/^>\s+/gm, "") // Blockquotes
    .trim()
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

async function fetchLinkCard(url: string, _agent: BskyAgent) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BlogBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const html = await res.text()

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

    let thumb: any = undefined
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) })
        if (imgRes.ok) {
          const mimeType = imgRes.headers.get("content-type")?.split(";")[0] ?? "image/jpeg"
          const buffer = await imgRes.arrayBuffer()
          const uploaded = await _agent.uploadBlob(new Uint8Array(buffer), { encoding: mimeType })
          thumb = uploaded.data.blob
        }
      } catch (e) {
        console.error("[Bsky] Thumbnail upload failed:", e)
      }
    }

    console.log(`[Bsky] Link card: "${title}" — ${url}`)
    return { uri: url, title, description, thumb }
  } catch (e) {
    console.error("[Bsky] fetchLinkCard failed:", e)
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

export async function postToBluesky(text: string, linkUrl: string) {
  try {
    const _agent = await getAgent()
    const [rt, card] = await Promise.all([
      prepareRichText(text),
      fetchLinkCard(linkUrl, _agent),
    ])

    const record: any = {
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
  } catch (err) {
    console.error("Failed to post to Bluesky:", err)
    return null
  }
}

export async function updateBlueskyPost(uri: string, cid: string, text: string, linkUrl: string) {
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

    // Fetch original record to keep createdAt
    const existing = await _agent.com.atproto.repo.getRecord({ repo, collection, rkey })

    let createdAt = new Date().toISOString()
    if (existing?.data?.value && typeof (existing.data.value as any).createdAt === "string") {
      createdAt = (existing.data.value as any).createdAt
    }

    const record: any = {
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      createdAt,
    }

    if (card) {
      record.embed = { $type: "app.bsky.embed.external", external: card }
    }

    const res = await _agent.com.atproto.repo.putRecord({
      repo,
      collection,
      rkey,
      swapRecord: cid,
      record,
    })

    return { uri: res.data.uri, cid: res.data.cid }
  } catch (err) {
    console.error("Failed to update Bluesky post:", err)
    return null
  }
}

export async function deleteBlueskyPost(uri: string) {
  try {
    const _agent = await getAgent()
    await _agent.deletePost(uri)
    return true
  } catch (err) {
    console.error("Failed to delete Bluesky post:", err)
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
  } catch (err) {
    console.error("Failed to fetch Bluesky stats:", err)
    return {}
  }
}

export function getPublicPostUrl(uri: string) {
  const parts = uri.replace("at://", "").split("/")
  const repo = parts[0]
  const rkey = parts[2]
  return `https://bsky.app/profile/${repo}/post/${rkey}`
}
