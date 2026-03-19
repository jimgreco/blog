import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"
import { NavSidebar } from "./components/NavSidebar"

export const metadata: Metadata = {
  title: "Jim Greco",
  description: "Notes, essays, and projects by Jim Greco",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="site-wrapper">
            <NavSidebar />
            <main className="main-content">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
