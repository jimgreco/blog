import type { Metadata } from "next"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPostsByType, getAllPostsByType } from "@/lib/dynamo"
import { formatDate, absoluteUrl } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Posts — Jim Greco",
}

export default async function NotesPage() {
  const session = await getServerSession(authOptions)
  const notes = await (session ? getAllPostsByType("note") : getPostsByType("note"))

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
          {notes.map((note) => (
            <li key={note.pk} className="note-item">
              <div className="note-meta">
                <Link href={`/notes/${note.pk}`} className="note-permalink">
                  {note.title}
                </Link>
                {note.link && (
                  <a href={absoluteUrl(note.link)} target="_blank" rel="noopener noreferrer" className="link-chip">↗</a>
                )}
                <span className="note-sep">·</span>
                <Link href={`/notes/${note.pk}`} className="note-permalink">
                  {formatDate(note.publishedAt)}
                </Link>
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
          ))}
        </ul>
      )}
    </div>
  )
}
