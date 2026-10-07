import { NextRequest, NextResponse } from "next/server"
import { getPublishedPosts, publicPost } from "@/lib/dynamo"
import { createPost } from "@/lib/post-store"
import { readPostInput } from "@/lib/post-input"
import { creationKey, isOwner, rateLimit } from "@/lib/mutation-guard"
import { mutationFailure, refreshPosts } from "@/lib/post-response"
export const dynamic = "force-dynamic"
export async function GET() {
  return NextResponse.json((await getPublishedPosts()).map(publicPost), { headers: { "Cache-Control": "no-store" } })
}
export async function POST(req: NextRequest) {
  if (!await isOwner()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await readPostInput(req)
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
