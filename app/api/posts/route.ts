import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { createPost, getPost, getPublishedPosts } from "@/lib/dynamo"
import { slugify } from "@/lib/utils"

export async function GET() {
  const posts = await getPublishedPosts()
  return NextResponse.json(posts)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { title, body, link, type, publishedAt, published } = await req.json()

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

  const post = { pk: slug, title: title.trim(), body, link, type: type ?? "note", publishedAt, published }
  await createPost(post)
  revalidatePath("/notes")
  revalidatePath("/essays")
  revalidatePath("/projects")
  revalidatePath("/links")
  return NextResponse.json(post, { status: 201 })
}
