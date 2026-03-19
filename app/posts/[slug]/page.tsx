import { notFound, redirect } from "next/navigation"
import { getPost } from "@/lib/dynamo"

export const dynamic = "force-dynamic"

interface Props {
  params: { slug: string }
}

// Legacy redirect: /posts/[slug] → /[type]s/[slug]
export default async function LegacyPostRedirect({ params }: Props) {
  const post = await getPost(params.slug)
  if (!post || !post.published) notFound()
  redirect(`/${post.type}s/${post.pk}`)
}
