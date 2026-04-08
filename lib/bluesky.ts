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

async function prepareRichText(body: string, slug: string, type: string, externalLink?: string) {
  const _agent = await getAgent()
  let plainText = stripMarkdown(body)
  
  // If there's an external link (like for a note/essay), append it if not already in text
  if (externalLink && !plainText.includes(externalLink)) {
    plainText += `\n\n${externalLink}`
  }

  let text = plainText
  const MAX_CHARS = 300
  
  if (plainText.length > MAX_CHARS) {
    const url = `https://jim-greco.com/${type}s/${slug}`
    // Truncate to make room for ellipsis and URL (~30-40 chars for URL)
    // We want some buffer. 250 seems safe.
    text = plainText.slice(0, 240).trimEnd() + "... " + url
  }

  const rt = new RichText({ text })
  await rt.detectFacets(_agent)
  return rt
}

export async function postToBluesky(_title: string, body: string, slug: string, type: string, externalLink?: string) {
  try {
    const _agent = await getAgent()
    const rt = await prepareRichText(body, slug, type, externalLink)

    const res = await _agent.post({
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    })

    return { uri: res.uri, cid: res.cid }
  } catch (err) {
    console.error("Failed to post to Bluesky:", err)
    return null
  }
}

export async function updateBlueskyPost(uri: string, cid: string, _title: string, body: string, slug: string, type: string, externalLink?: string) {
  try {
    const _agent = await getAgent()
    const rt = await prepareRichText(body, slug, type, externalLink)

    const uriParts = uri.replace("at://", "").split("/")
    const repo = uriParts[0]
    const collection = uriParts[1]
    const rkey = uriParts[2]

    // Fetch original record to keep createdAt
    const existing = await _agent.com.atproto.repo.getRecord({
      repo,
      collection,
      rkey,
    })

    let createdAt = new Date().toISOString()
    if (existing && existing.data && existing.data.value && typeof existing.data.value.createdAt === "string") {
      createdAt = existing.data.value.createdAt
    }

    const res = await _agent.com.atproto.repo.putRecord({
      repo,
      collection,
      rkey,
      swapRecord: cid,
      record: {
        $type: "app.bsky.feed.post",
        text: rt.text,
        facets: rt.facets,
        createdAt,
      },
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
