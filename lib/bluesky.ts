import { BskyAgent, RichText } from "@atproto/api"

let agent: BskyAgent | null = null

async function getAgent() {
  if (agent) return agent

  const identifier = process.env.BLUESKY_IDENTIFIER
  const password = process.env.BLUESKY_PASSWORD

  if (!identifier || !password) {
    throw new Error("Bluesky credentials not configured")
  }

  agent = new BskyAgent({ service: "https://bsky.social" })
  await agent.login({ identifier, password })
  return agent
}

function stripMarkdown(body: string): string {
  // Basic markdown removal while trying to maintain spacing
  return body
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Links: [text](url) -> text
    .replace(/[\*_]{1,2}([^\*_]+)[\*_]{1,2}/g, "$1") // Bold/Italic
    .replace(/^#+\s+/gm, "") // Headers
    .replace(/`{1,3}[^`]+`{1,3}/g, "") // Code blocks
    .replace(/^>\s+/gm, "") // Blockquotes
    .trim()
}

async function prepareRichText(body: string, slug: string, type: string) {
  const _agent = await getAgent()
  const plainText = stripMarkdown(body)
  
  let text = plainText
  const MAX_CHARS = 300
  
  if (plainText.length > MAX_CHARS) {
    const url = `https://jim-greco.com/${type}s/${slug}`
    // Truncate to make room for ellipsis and URL (~30-40 chars for URL)
    // We want some buffer. 250 seems safe.
    text = plainText.slice(0, 250).trimEnd() + "... " + url
  }

  const rt = new RichText({ text })
  await rt.detectFacets(_agent)
  return rt
}

export async function postToBluesky(_title: string, body: string, slug: string, type: string) {
  try {
    const _agent = await getAgent()
    const rt = await prepareRichText(body, slug, type)

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

export async function updateBlueskyPost(uri: string, cid: string, _title: string, body: string, slug: string, type: string) {
  try {
    const _agent = await getAgent()
    const rt = await prepareRichText(body, slug, type)

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
