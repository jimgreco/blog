import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createPost, getPost, getPublishedPosts, Post } from "@/lib/dynamo"
import { slugify } from "@/lib/utils"
import { postToBluesky } from "@/lib/bluesky"
import { postToMastodon } from "@/lib/mastodon"

export async function GET() {
  const posts = await getPublishedPosts()
  return NextResponse.json(posts)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { title, body, link, type, publishedAt, published, bskyText, bskyLinkTarget } = await req.json()

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 })
  }

  // Generate a unique slug
  let slug = slugify(title)
  let attempt = 0
  while (attempt < 10) {
    const existing = await getPost(slug)
    if (!existing) break
    attempt++
    slug = `${slugify(title)}-${attempt}`
  }

  const post: Post = {
    pk: slug,
    title: title.trim(),
    body,
    link,
    type: type ?? "note",
    publishedAt,
    published,
    bskyText: bskyText || undefined,
    bskyLinkTarget: bskyLinkTarget || undefined,
  }

  if (published) {
    const postUrl = `https://jim-greco.com/${post.type}s/${post.pk}`
    let linkUrl: string | undefined = bskyLinkTarget === "link" && link ? link : postUrl
    if (bskyLinkTarget === "none") linkUrl = undefined

    // 1. Bluesky (if bskyText provided)
    if (bskyText?.trim()) {
      console.log(`[Syndicate:Bsky] Posting for slug: ${post.pk}, linkUrl: ${linkUrl}`)
      const bsky = await postToBluesky(bskyText.trim(), linkUrl)
      if (bsky) {
        post.bskyUri = bsky.uri
        post.bskyCid = bsky.cid
      }
    }

    // 2. Mastodon (uses bskyText if available, else body)
    const isSyndicatable = post.type === "note" || post.type === "essay"
    if (isSyndicatable && process.env.MASTODON_INSTANCE_URL && process.env.MASTODON_ACCESS_TOKEN) {
      const mastoBody = bskyText?.trim() || body
      const masto = await postToMastodon(post.title, mastoBody, post.pk, post.type, linkUrl)
      if (masto) {
        console.log(`[Syndicate:Masto] Success: ${masto.uri}`)
        post.mastodonUri = masto.uri
        post.mastodonId = masto.id
      }
    }
  }

  await createPost(post)
  revalidatePath("/notes")
  revalidatePath("/essays")
  revalidatePath("/projects")
  revalidatePath("/links")
  return NextResponse.json(post, { status: 201 })
}
