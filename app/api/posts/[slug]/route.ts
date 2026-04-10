import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPost, updatePost, deletePost } from "@/lib/dynamo"
import { postToBluesky, updateBlueskyPost, deleteBlueskyPost } from "@/lib/bluesky"
import { postToMastodon, updateMastodonPost, deleteMastodonPost } from "@/lib/mastodon"

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

  if (published) {
    const postType = type ?? existing.type
    const postUrl = `https://jim-greco.com/${postType}s/${params.slug}`
    let linkUrl: string | undefined = bskyLinkTarget === "link" && link ? link : postUrl
    if (bskyLinkTarget === "none") linkUrl = undefined

    // 1. Bluesky (uses dedicated bskyText)
    if (bskyText?.trim()) {
      if (existing.bskyUri && existing.bskyCid) {
        console.log(`[Syndicate-PUT:Bsky] Updating existing: ${existing.bskyUri}`)
        const bsky = await updateBlueskyPost(existing.bskyUri, existing.bskyCid, bskyText.trim(), linkUrl)
        if (bsky) {
          updates.bskyUri = bsky.uri
          updates.bskyCid = bsky.cid
        }
      } else {
        const bsky = await postToBluesky(bskyText.trim(), linkUrl)
        if (bsky) {
          updates.bskyUri = bsky.uri
          updates.bskyCid = bsky.cid
        }
      }
    } else if (existing.bskyUri) {
      // If bskyText cleared, delete the post
      await deleteBlueskyPost(existing.bskyUri)
      updates.bskyUri = null
      updates.bskyCid = null
    }

    // 2. Mastodon (uses bskyText if available, else body)
    const isSyndicatable = postType === "note" || postType === "essay"
    if (isSyndicatable && process.env.MASTODON_INSTANCE_URL && process.env.MASTODON_ACCESS_TOKEN) {
      const mastoBody = bskyText?.trim() || body
      if (existing.mastodonId) {
        console.log(`[Syndicate-PUT:Masto] Updating existing: ${existing.mastodonId}`)
        const masto = await updateMastodonPost(existing.mastodonId, title, mastoBody, params.slug, postType, linkUrl)
        if (masto) {
          updates.mastodonUri = masto.uri
          updates.mastodonId = masto.id
        }
      } else {
        const masto = await postToMastodon(title, mastoBody, params.slug, postType, linkUrl)
        if (masto) {
          updates.mastodonUri = masto.uri
          updates.mastodonId = masto.id
        }
      }
    }
  } else {
    // Unpublishing - delete from all platforms
    if (existing.bskyUri) {
      await deleteBlueskyPost(existing.bskyUri)
      updates.bskyUri = null
      updates.bskyCid = null
    }
    if (existing.mastodonId) {
      await deleteMastodonPost(existing.mastodonId)
      updates.mastodonUri = null
      updates.mastodonId = null
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
  if (existing?.mastodonId) {
    await deleteMastodonPost(existing.mastodonId)
  }

  await deletePost(params.slug)
  revalidatePath("/notes")
  revalidatePath("/essays")
  revalidatePath("/projects")
  revalidatePath("/links")
  return NextResponse.json({ success: true })
}
