import type { Post } from "./dynamo"

export const MAX_POST_BYTES = 256 * 1024

export type PostInput = Pick<Post, "title" | "body" | "type" | "publishedAt" | "published" | "link"> & {
  bskyText: string
  bskyLinkTarget: "post" | "link" | "none"
}
type InputResult = { input: PostInput; error?: never } | { error: Response; input?: never }
const failure = (message: string, status: number) => Response.json({ error: message }, { status })

// Use the configured public origin, never a caller-controlled Host/forwarded header.
export function mutationOriginError(req: Request): Response | null {
  let expected: URL
  try {
    expected = new URL(process.env.NEXTAUTH_URL || "")
    if (!["http:", "https:"].includes(expected.protocol)) throw new Error("Invalid origin")
  } catch {
    return failure("Mutation origin is not configured.", 500)
  }
  return req.headers.get("origin") === expected.origin
    ? null : failure("Same-origin request required.", 403)
}

export async function readPostInput(req: Request): Promise<InputResult> {
  const originError = mutationOriginError(req)
  if (originError) return { error: originError }
  if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return { error: failure("Use application/json.", 415) }
  }
  const length = req.headers.get("content-length")
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_POST_BYTES)) {
    return { error: failure("Request body is too large or has an invalid length.", 413) }
  }
  const reader = req.body?.getReader()
  if (!reader) return { error: failure("JSON body is required.", 400) }
  let value: unknown
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value: chunk, done } = await reader.read()
      if (done) break
      size += chunk.byteLength
      if (size > MAX_POST_BYTES) {
        await reader.cancel()
        return { error: failure("Request body is too large.", 413) }
      }
      chunks.push(chunk)
    }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
  } catch {
    return { error: failure("Invalid JSON body.", 400) }
  } finally {
    reader.releaseLock()
  }
  const invalid = () => ({ error: failure("Invalid post fields.", 400) })
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid()
  const fields = value as Record<string, unknown>
  const allowed = ["title", "body", "link", "type", "publishedAt", "published", "bskyText", "bskyLinkTarget"]
  if (Object.keys(fields).some(key => !allowed.includes(key))) return invalid()
  const { title, body, link, type, publishedAt, published, bskyText, bskyLinkTarget } = fields
  // The editor submits a complete record. Reject partial PUTs instead of treating
  // an omitted publication flag/social text as an instruction to unpublish/delete.
  if (typeof title !== "string" || !title.trim() || title.length > 512 || typeof body !== "string" ||
      typeof published !== "boolean" || typeof publishedAt !== "string" ||
      typeof bskyText !== "string" || bskyText.length > 10000 ||
      (type !== "note" && type !== "essay" && type !== "project" && type !== "link") ||
      (bskyLinkTarget !== "post" && bskyLinkTarget !== "link" && bskyLinkTarget !== "none")) return invalid()
  if (link !== undefined) {
    if (typeof link !== "string" || link.length > 4096) return invalid()
    if (link) {
      try {
        const url = new URL(link)
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return invalid()
      } catch { return invalid() }
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(publishedAt)) return invalid()
  const date = new Date(publishedAt)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== publishedAt.replace(/Z$/, publishedAt.includes(".") ? "Z" : ".000Z")) return invalid()
  return { input: { title: title.trim(), body, link, type, publishedAt, published, bskyText, bskyLinkTarget } }
}
