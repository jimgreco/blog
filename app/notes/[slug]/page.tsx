import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPost } from "@/lib/dynamo"
import { formatDate, absoluteUrl } from "@/lib/utils"
import { getBlueskyStats, getPublicPostUrl } from "@/lib/bluesky"

export const dynamic = "force-dynamic"

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug)
  if (!post || !post.published) return {}
  return { title: `${post.title} — Jim Greco` }
}

export default async function NotePage({ params }: Props) {
  const [post, session] = await Promise.all([
    getPost(params.slug),
    getServerSession(authOptions),
  ])

  if (!post || !post.published || post.type !== "note") notFound()

  const bskyStats = post.bskyUri ? await getBlueskyStats([post.bskyUri]) : null
  const stats = post.bskyUri && bskyStats ? bskyStats[post.bskyUri] : null

  return (
    <article>
      <h1 className="note-title">
        {post.link ? (
          <a href={absoluteUrl(post.link)}>{post.title}</a>
        ) : (
          post.title
        )}
        {post.link && (
          <Link href={`/notes/${post.pk}`} className="permalink-glyph permalink-glyph-title" title="Permalink">★</Link>
        )}
      </h1>
      <p className="post-date" style={{ marginBottom: "1.5rem" }}>
        {formatDate(post.publishedAt)}
        {stats && (
          <>
            <span className="note-sep">·</span>
            <a href={getPublicPostUrl(post.bskyUri!)} className="note-bsky-stats" target="_blank" rel="noopener noreferrer">
              {stats.likeCount > 0 && <span className="stat-item">{stats.likeCount} like{stats.likeCount !== 1 ? "s" : ""}</span>}
              {stats.likeCount > 0 && stats.replyCount > 0 && <span className="stat-sep">, </span>}
              {stats.replyCount > 0 && <span className="stat-item">{stats.replyCount} repl{stats.replyCount !== 1 ? "ies" : "y"}</span>}
              {stats.likeCount === 0 && stats.replyCount === 0 && <span className="stat-item">Discuss on Bluesky</span>}
            </a>
          </>
        )}
      </p>
      <div className="post-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
      </div>
      <div className="post-footer">
        <Link href="/notes" className="back-link-text">← Posts</Link>
        {session && (
          <Link href={`/admin?edit=${post.pk}`} className="inline-edit">Edit</Link>
        )}
      </div>
    </article>
  )
}
