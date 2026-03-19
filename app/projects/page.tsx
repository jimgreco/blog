import type { Metadata } from "next"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPostsByType, getAllPostsByType } from "@/lib/dynamo"
import { getExcerpt, absoluteUrl } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Projects — Jim Greco",
}

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions)
  const projects = await (session ? getAllPostsByType("project") : getPostsByType("project"))

  return (
    <div>
      {session && (
        <div className="section-actions">
          <Link href="/admin?type=project" className="btn btn-sm">+ New</Link>
        </div>
      )}
      {projects.length === 0 ? (
        <p className="empty-state">No projects yet.</p>
      ) : (
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.pk} className="project-item">
              <div className="project-title-row">
                <Link href={`/projects/${project.pk}`} className="project-link">
                  {project.title}
                </Link>
                {project.link && (
                  <a href={absoluteUrl(project.link)} target="_blank" rel="noopener noreferrer" className="link-chip">↗</a>
                )}
                {!project.published && (
                  <span className="draft-badge">draft</span>
                )}
                {session && (
                  <Link href={`/admin?edit=${project.pk}`} className="inline-edit">
                    edit
                  </Link>
                )}
              </div>
              <p className="project-excerpt">{getExcerpt(project.body, 160)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
