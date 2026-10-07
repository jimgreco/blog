import { BskyAgent, RichText } from "@atproto/api"
import type { AppBskyFeedPost } from "@atproto/api"
import { fetchLinkCard } from "./bluesky"
import type { Operation, Provider, Remote } from "./social-model"

export async function deliverSocial(provider: Provider, operation: Operation): Promise<Remote> {
  const signal = AbortSignal.timeout(15_000)
  return provider === "bluesky" ? bluesky(operation, signal) : mastodon(operation, signal)
}
async function mastodon(operation: Operation, signal: AbortSignal): Promise<Remote> {
  const instance = new URL(process.env.MASTODON_INSTANCE_URL || "")
  if (instance.protocol !== "https:" || instance.username || instance.password || instance.search || instance.hash) throw new Error("Invalid provider configuration")
  const token = process.env.MASTODON_ACCESS_TOKEN
  if (!token) throw new Error("Missing provider configuration")
  const id = operation.remote.id
  const publish = operation.desired.publish
  if (!publish && !id) return {}
  if (id && !/^\d+$/.test(id)) throw new Error("Invalid provider reference")
  const response = await fetch(new URL(`/api/v1/statuses${id ? `/${id}` : ""}`, instance), {
    method: publish ? id ? "PUT" : "POST" : "DELETE", signal, redirect: "error",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      ...(!id && publish ? { "Idempotency-Key": `blog-${operation.id}` } : {}) },
    ...(publish ? { body: JSON.stringify({ status: operation.desired.text }) } : {}),
  })
  if (!publish && (response.ok || response.status === 404 || response.status === 410)) return {}
  if (!response.ok) { await response.body?.cancel(); throw new Error("Provider request failed") }
  const result = await response.json()
  if (typeof result.id !== "string" || !/^\d+$/.test(result.id) || typeof result.url !== "string") throw new Error("Invalid provider response")
  return { id: result.id, uri: result.url }
}
async function bluesky(operation: Operation, signal: AbortSignal): Promise<Remote> {
  const identifier = process.env.BLUESKY_IDENTIFIER
  const password = process.env.BLUESKY_PASSWORD
  if (!identifier || !password) throw new Error("Missing provider configuration")
  const agent = new BskyAgent({ service: "https://bsky.social", fetch: (url, init) => fetch(url, { ...init, signal }) })
  await agent.login({ identifier, password })
  const repo = agent.session!.did
  const collection = "app.bsky.feed.post"
  let rkey = `blog-${operation.id}`
  if (operation.remote.uri) {
    const parts = operation.remote.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/)
    if (!parts || parts[1] !== repo) throw new Error("Provider account mismatch")
    rkey = parts[2]
  }
  if (!operation.desired.publish) {
    // deleteRecord is idempotent even if the record no longer exists.
    await agent.com.atproto.repo.deleteRecord({ repo, collection, rkey })
    return {}
  }
  const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(operation.desired.text), part => part.segment)
  const text = graphemes.length > 300 ? graphemes.slice(0, 297).join("") + "..." : operation.desired.text
  const rich = new RichText({ text })
  await rich.detectFacets(agent)
  let createdAt = operation.createdAt
  if (operation.remote.uri) {
    const original = await agent.com.atproto.repo.getRecord({ repo, collection, rkey })
    const value = original.data.value
    if (value && typeof value === "object" && "createdAt" in value && typeof value.createdAt === "string") createdAt = value.createdAt
  }
  const card = await fetchLinkCard(operation.desired.linkUrl, agent, signal)
  signal.throwIfAborted()
  const record: AppBskyFeedPost.Record = { $type: collection, text: rich.text, createdAt,
    ...(rich.facets?.length ? { facets: rich.facets } : {}),
    ...(card ? { embed: { $type: "app.bsky.embed.external", external: card } as const } : {}),
  }
  const result = await agent.com.atproto.repo.putRecord({ repo, collection, rkey, record })
  return { uri: result.data.uri, cid: result.data.cid }
}
