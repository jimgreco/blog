import { createHash } from "node:crypto"
import type { Post } from "./dynamo"

export type Provider = "bluesky" | "mastodon"
export type Remote = { uri?: string; cid?: string; id?: string }
export type Desired = { publish: boolean; text: string; linkUrl?: string; account: string }
export type Operation = {
  id: string; revision: number; desired: Desired; remote: Remote
  createdAt: string; startedAt?: number; attempts: number
}
export type Outbox = {
  pk: string; kind: "outbox"; slug: string; provider: Provider
  desired: Desired; desiredRevision: number; completedRevision: number
  remote: Remote; account: string; active?: Operation; leaseToken?: string; leaseUntil?: number
  nextAttemptAt: number; status: "pending" | "sending" | "retry" | "delivered" | "blocked"
  issue?: string
}
export const providers: Provider[] = ["bluesky", "mastodon"]
export const outboxKey = (slug: string, provider: Provider) => `!outbox#${provider}#${slug}`
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export function accountKey(provider: Provider): string {
  // Bind queued work to the configured account, without storing credentials.
  return fingerprint(provider === "bluesky"
    ? [provider, process.env.BLUESKY_IDENTIFIER || ""]
    : [provider, process.env.MASTODON_INSTANCE_URL || "", process.env.MASTODON_ACCESS_TOKEN || ""])
}
export function mastodonText(body: string, link?: string): string {
  let text = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1").replace(/^#+\s+/gm, "")
    .replace(/`{1,3}[^`]+`{1,3}/g, "").replace(/^>\s+/gm, "").trim()
  if (link && !text.includes(link)) text += `\n\n${link}`
  if ([...text].length <= 500) return text
  const suffix = link && [...link].length < 450 ? `... ${link}` : "..."
  return [...text].slice(0, 500 - [...suffix].length).join("").trimEnd() + suffix
}
export function desiredFor(post: Post, provider: Provider): Desired {
  let linkUrl: string | undefined = post.bskyLinkTarget === "none" ? undefined
    : post.bskyLinkTarget === "link" && post.link ? post.link
    : `https://jim-greco.com/${post.type}s/${post.pk}`
  const enabled = provider === "bluesky" ? Boolean(post.bskyText?.trim())
    : (post.type === "note" || post.type === "essay") && Boolean(process.env.MASTODON_INSTANCE_URL && process.env.MASTODON_ACCESS_TOKEN)
  const publish = post.published === true && !post.deleted && enabled
  const text = !publish ? "" : provider === "bluesky" ? post.bskyText!.trim()
    : mastodonText(post.bskyText?.trim() || post.body, linkUrl)
  if (!publish) linkUrl = undefined
  return { publish: Boolean(publish), text, ...(linkUrl ? { linkUrl } : {}), account: accountKey(provider) }
}
export function remoteFor(post: Post, provider: Provider): Remote {
  return provider === "bluesky"
    ? { ...(post.bskyUri ? { uri: post.bskyUri } : {}), ...(post.bskyCid ? { cid: post.bskyCid } : {}) }
    : { ...(post.mastodonId ? { id: post.mastodonId } : {}), ...(post.mastodonUri ? { uri: post.mastodonUri } : {}) }
}
