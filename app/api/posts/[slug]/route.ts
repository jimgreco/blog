import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPost, updatePost, deletePost } from "@/lib/dynamo"

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

  const { title, body, link, publishedAt, published, type } = await req.json()
  await updatePost(params.slug, { title, body, link, publishedAt, published, type })
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

  await deletePost(params.slug)
  revalidatePath("/notes")
  revalidatePath("/essays")
  revalidatePath("/projects")
  revalidatePath("/links")
  return NextResponse.json({ success: true })
}
