import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPost } from "@/lib/dynamo"
import { formatDate, absoluteUrl } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug)
  if (!post || !post.published) return {}
  return { title: `${post.title} — Jim Greco` }
}

export default async function ProjectPage({ params }: Props) {
  const [post, session] = await Promise.all([
    getPost(params.slug),
    getServerSession(authOptions),
  ])

  if (!post || !post.published || post.type !== "project") notFound()

  return (
    <article>
      <header className="post-header">
        <h1 className="post-title">
          {post.title}
          {post.link && (
            <a href={absoluteUrl(post.link!)} target="_blank" rel="noopener noreferrer" className="link-chip link-chip-title">↗</a>
          )}
        </h1>
        <p className="post-date">{formatDate(post.publishedAt)}</p>
      </header>
      <div className="post-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
      </div>
      <div className="post-footer">
        <Link href="/projects" className="back-link-text">← Projects</Link>
        {session && (
          <Link href={`/admin?edit=${post.pk}`} className="inline-edit">Edit</Link>
        )}
      </div>
    </article>
  )
}
