import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPost, updatePost, deletePost } from "@/lib/dynamo"
import { postToBluesky, updateBlueskyPost, deleteBlueskyPost } from "@/lib/bluesky"

interface Context {
  params: { slug: string }
}

export async function GET(_req: NextRequest, { params }: Context) {
  const post = await getPost(params.slug)
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(post)
}

export async function PUT(req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { title, body, link, publishedAt, published, type, bskyText, bskyLinkTarget } = await req.json()
  const existing = await getPost(params.slug)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updates: any = { title, body, link, publishedAt, published, type, bskyText, bskyLinkTarget }

  console.log(`[PUT /${params.slug}] published=${published} bskyText=${JSON.stringify(bskyText)} existingBskyUri=${existing.bskyUri ?? "none"}`)

  if (published && bskyText?.trim()) {
    const postType = type ?? existing.type
    const postUrl = `https://jim-greco.com/${postType}s/${params.slug}`
    const linkUrl = bskyLinkTarget === "link" && link ? link : postUrl

    if (existing.bskyUri && existing.bskyCid) {
      console.log(`[Syndicate-PUT] Updating existing: ${existing.bskyUri}`)
      const bsky = await updateBlueskyPost(existing.bskyUri, existing.bskyCid, bskyText.trim(), linkUrl)
      if (bsky) {
        console.log(`[Syndicate-PUT] Success (update): ${bsky.uri}`)
        updates.bskyUri = bsky.uri
        updates.bskyCid = bsky.cid
      } else {
        console.log(`[Syndicate-PUT] Failed (update returned null)`)
      }
    } else {
      console.log(`[Syndicate-PUT] Creating new for slug: ${params.slug}`)
      const bsky = await postToBluesky(bskyText.trim(), linkUrl)
      if (bsky) {
        console.log(`[Syndicate-PUT] Success (new): ${bsky.uri}`)
        updates.bskyUri = bsky.uri
        updates.bskyCid = bsky.cid
      } else {
        console.log(`[Syndicate-PUT] Failed (new returned null)`)
      }
    }
  } else {
    // No Bluesky text (or unpublished) — delete existing post if any
    if (existing.bskyUri) {
      await deleteBlueskyPost(existing.bskyUri)
      updates.bskyUri = null
      updates.bskyCid = null
    }
  }

  await updatePost(params.slug, updates)
  revalidatePath("/notes")
  revalidatePath("/essays")
  revalidatePath("/projects")
  revalidatePath("/links")
  revalidatePath(`/notes/${params.slug}`)
  revalidatePath(`/essays/${params.slug}`)
  revalidatePath(`/projects/${params.slug}`)
  revalidatePath(`/links/${params.slug}`)
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const existing = await getPost(params.slug)
  if (existing?.bskyUri) {
    await deleteBlueskyPost(existing.bskyUri)
  }

  await deletePost(params.slug)
  revalidatePath("/notes")
  revalidatePath("/essays")
  revalidatePath("/projects")
  revalidatePath("/links")
  return NextResponse.json({ success: true })
}
