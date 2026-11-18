import { NextRequest, NextResponse } from "next/server"
import { getAllPosts, getPublishedPosts, publicPost } from "@/lib/dynamo"
import { createPost } from "@/lib/post-store"
import { readPostInput } from "@/lib/post-input"
import { authorize, creationKey, rateLimit } from "@/lib/mutation-guard"
import { mutationFailure, refreshPosts } from "@/lib/post-response"
export const dynamic = "force-dynamic"
export async function GET(req: NextRequest) {
  // `?drafts=1` lets the owner's app list unpublished posts too.
  const drafts = new URL(req.url).searchParams.get("drafts") === "1"
  if (drafts && !await authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const posts = drafts ? await getAllPosts() : await getPublishedPosts()
  // The owner's editor must send social text back on every save; omitting it
  // would remove an existing Bluesky/Mastodon post, so return it to the owner only.
  const body = drafts
    ? posts.map(post => ({ ...publicPost(post), bskyText: post.bskyText ?? "", bskyLinkTarget: post.bskyLinkTarget ?? "post" }))
    : posts.map(publicPost)
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
export async function POST(req: NextRequest) {
  const caller = await authorize(req)
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await readPostInput(req, { checkOrigin: caller === "browser" })
  if (result.error) return result.error
  const key = creationKey(req)
  if (key instanceof Response) return key
  try {
    const limited = await rateLimit("mutations")
    if (limited) return limited
    const post = await createPost(result.input, key)
    refreshPosts(post.pk)
    return NextResponse.json(post, { status: 201, headers: { "Cache-Control": "no-store", ETag: `"${post.revision}"` } })
  } catch (error) { return mutationFailure(error) }
}
