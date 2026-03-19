import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { getAllPosts } from "@/lib/dynamo"
import type { PostType } from "@/lib/dynamo"
import AdminClient from "./AdminClient"

export const dynamic = "force-dynamic"

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { type?: string; edit?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/api/auth/signin")

  const posts = await getAllPosts()
  const defaultType = (searchParams.type as PostType) || undefined
  const defaultSlug = searchParams.edit || undefined

  return <AdminClient initialPosts={posts} defaultType={defaultType} defaultSlug={defaultSlug} />
}
