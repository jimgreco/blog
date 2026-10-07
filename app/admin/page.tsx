import { redirect } from "next/navigation"
import { isOwner } from "@/lib/mutation-guard"
import { getAllPosts } from "@/lib/dynamo"
import type { PostType } from "@/lib/dynamo"
import AdminClient from "./AdminClient"

export const dynamic = "force-dynamic"

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; edit?: string }>
}) {
  if (!await isOwner()) redirect("/api/auth/signin")

  const posts = await getAllPosts()
  const query = await searchParams
  const defaultType = (query.type as PostType) || undefined
  const defaultSlug = query.edit || undefined

  return <AdminClient initialPosts={posts} defaultType={defaultType} defaultSlug={defaultSlug} />
}
