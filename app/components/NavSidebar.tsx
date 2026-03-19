"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/notes", label: "Posts" },
  { href: "/essays", label: "Essays" },
  { href: "/projects", label: "Projects" },
  { href: "/links", label: "Links" },
]

export function NavSidebar() {
  const pathname = usePathname()

  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        <Link href="/">Jim Greco</Link>
      </div>
      <nav>
        <ul className="sidebar-nav">
          {NAV_ITEMS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={
                  pathname === href || pathname.startsWith(href + "/")
                    ? "active"
                    : ""
                }
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
