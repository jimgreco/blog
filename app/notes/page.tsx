import type { Metadata } from "next"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPostsByType, getAllPostsByType } from "@/lib/dynamo"
import { formatDate, absoluteUrl } from "@/lib/utils"
import { getBlueskyStats, getPublicPostUrl } from "@/lib/bluesky"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Posts — Jim Greco",
}

export default async function NotesPage() {
  const session = await getServerSession(authOptions)
  const notes = await (session ? getAllPostsByType("note") : getPostsByType("note"))

  const bskyUris = notes.map(n => n.bskyUri).filter((u): u is string => !!u)
  const bskyStats = await getBlueskyStats(bskyUris)

  return (
    <div>
      {session && (
        <div className="section-actions">
          <Link href="/admin?type=note" className="btn btn-sm">+ New</Link>
        </div>
      )}
      {notes.length === 0 ? (
        <p className="empty-state">No posts yet.</p>
      ) : (
        <ul className="note-feed">
          {notes.map((note) => {
            const stats = note.bskyUri ? bskyStats[note.bskyUri] : null
            
            return (
              <li key={note.pk} className="note-item">
                <div className="note-meta">
                  {note.link ? (
                    <>
                      <a href={absoluteUrl(note.link)} className="note-permalink">{note.title}</a>
                      <Link href={`/notes/${note.pk}`} className="permalink-glyph" title="Permalink">★</Link>
                    </>
                  ) : (
                    <Link href={`/notes/${note.pk}`} className="note-permalink">{note.title}</Link>
                  )}
                  <span className="note-sep">·</span>
                  <Link href={`/notes/${note.pk}`} className="note-permalink">
                    {formatDate(note.publishedAt)}
                  </Link>
                  {stats && (
                    <>
                      <span className="note-sep">·</span>
                      <a href={getPublicPostUrl(note.bskyUri!)} className="note-bsky-stats" target="_blank" rel="noopener noreferrer">
                        {stats.likeCount > 0 && <span className="stat-item">{stats.likeCount} like{stats.likeCount !== 1 ? "s" : ""}</span>}
                        {stats.likeCount > 0 && stats.replyCount > 0 && <span className="stat-sep">, </span>}
                        {stats.replyCount > 0 && <span className="stat-item">{stats.replyCount} repl{stats.replyCount !== 1 ? "ies" : "y"}</span>}
                        {stats.likeCount === 0 && stats.replyCount === 0 && <span className="stat-item">Discuss on Bluesky</span>}
                      </a>
                    </>
                  )}
                  {!note.published && (
                    <span className="draft-badge">draft</span>
                  )}
                  {session && (
                    <>
                      <span className="note-sep">·</span>
                      <Link href={`/admin?edit=${note.pk}`} className="inline-edit">edit</Link>
                    </>
                  )}
                </div>
                <div className="note-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
