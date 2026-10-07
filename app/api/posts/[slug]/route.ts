import { NextRequest, NextResponse } from "next/server"
import { getPost, publicPost } from "@/lib/dynamo"
import { savePost } from "@/lib/post-store"
import { mutationOriginError, readPostInput } from "@/lib/post-input"
import { isOwner, rateLimit, revisionFrom } from "@/lib/mutation-guard"
import { mutationFailure, refreshPosts } from "@/lib/post-response"
interface Context { params: Promise<{ slug: string }> }
export const dynamic = "force-dynamic"
export async function GET(_req: NextRequest, { params }: Context) {
  const post = await getPost((await params).slug)
  const headers = { "Cache-Control": "no-store" }
  if (!post || post.published !== true) return NextResponse.json({ error: "Not found" }, { status: 404, headers })
  return NextResponse.json(publicPost(post), { headers: { ...headers, ETag: `"${post.revision ?? 0}"` } })
}
export async function PUT(req: NextRequest, { params }: Context) {
  if (!await isOwner()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await readPostInput(req)
  if (result.error) return result.error
  const revision = revisionFrom(req)
  if (revision instanceof Response) return revision
  try {
    const limited = await rateLimit("mutations")
    if (limited) return limited
    const post = await savePost((await params).slug, result.input, revision)
    refreshPosts(post.pk)
    return NextResponse.json(post, { headers: { "Cache-Control": "no-store", ETag: `"${post.revision}"` } })
  } catch (error) { return mutationFailure(error) }
}
export async function DELETE(req: NextRequest, { params }: Context) {
  if (!await isOwner()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const originError = mutationOriginError(req)
  if (originError) return originError
  const revision = revisionFrom(req)
  if (revision instanceof Response) return revision
  try {
    const limited = await rateLimit("mutations")
    if (limited) return limited
    const post = await savePost((await params).slug, null, revision)
    refreshPosts(post.pk)
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return mutationFailure(error) }
}
