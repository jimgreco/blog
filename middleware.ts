export { default } from "next-auth/middleware"

export const runtime = "nodejs"

export const config = {
  matcher: ["/admin/:path*"],
}
