import type { Metadata } from "next"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPostsByType, getAllPostsByType } from "@/lib/dynamo"
import { formatDateShort, absoluteUrl } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Essays — Jim Greco",
}

export default async function EssaysPage() {
  const session = await getServerSession(authOptions)
  const essays = await (session ? getAllPostsByType("essay") : getPostsByType("essay"))

  return (
    <div>
      {session && (
        <div className="section-actions">
          <Link href="/admin?type=essay" className="btn btn-sm">+ New</Link>
        </div>
      )}
      {essays.length === 0 ? (
        <p className="empty-state">No essays yet.</p>
      ) : (
        <ul className="essay-list">
          {essays.map((essay) => (
            <li key={essay.pk} className="essay-list-item">
              <span className="essay-list-title-row">
                <Link href={`/essays/${essay.pk}`} className="essay-list-title">
                  {essay.title}
                </Link>
                {essay.link && (
                  <a href={absoluteUrl(essay.link)} target="_blank" rel="noopener noreferrer" className="link-chip">↗</a>
                )}
                {!essay.published && (
                  <span className="draft-badge">draft</span>
                )}
              </span>
              <span className="essay-list-right">
                <span className="essay-list-date">
                  {formatDateShort(essay.publishedAt)}
                </span>
                {session && (
                  <Link href={`/admin?edit=${essay.pk}`} className="inline-edit">
                    edit
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
