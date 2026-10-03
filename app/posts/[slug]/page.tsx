import { notFound, redirect } from "next/navigation"
import { getPost } from "@/lib/dynamo"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ slug: string }>
}

// Legacy redirect: /posts/[slug] → /[type]s/[slug]
export default async function LegacyPostRedirect({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post || !post.published) notFound()
  redirect(`/${post.type}s/${post.pk}`)
}
