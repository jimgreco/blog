import type { Metadata } from "next"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPostsByType, getAllPostsByType } from "@/lib/dynamo"
import { formatDateShort, absoluteUrl } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Links — Jim Greco",
}

export default async function LinksPage() {
  const session = await getServerSession(authOptions)
  const links = await (session ? getAllPostsByType("link") : getPostsByType("link"))

  return (
    <div>
      {session && (
        <div className="section-actions">
          <Link href="/admin?type=link" className="btn btn-sm">+ New</Link>
        </div>
      )}
      {links.length === 0 ? (
        <p className="empty-state">No links yet.</p>
      ) : (
        <ul className="essay-list">
          {links.map((link) => (
            <li key={link.pk} className="essay-list-item">
              <span className="essay-list-title-row">
                {link.link ? (
                  <>
                    <a href={absoluteUrl(link.link)} className="essay-list-title">{link.title}</a>
                    <Link href={`/links/${link.pk}`} className="permalink-glyph" title="Permalink">★</Link>
                  </>
                ) : (
                  <Link href={`/links/${link.pk}`} className="essay-list-title">{link.title}</Link>
                )}
                {!link.published && (
                  <span className="draft-badge">draft</span>
                )}
              </span>
              <span className="essay-list-right">
                <span className="essay-list-date">
                  {formatDateShort(link.publishedAt)}
                </span>
                {session && (
                  <Link href={`/admin?edit=${link.pk}`} className="inline-edit">
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
