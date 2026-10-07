import { timingSafeEqual } from "node:crypto"
import { rateLimit } from "@/lib/mutation-guard"
import { dispatchDeliveries } from "@/lib/social-outbox"
export const dynamic = "force-dynamic"
// Optional server scheduler. Disabled until a dedicated secret is configured;
// this route never uses a browser session or accepts a secret in a URL.
export async function POST(req: Request) {
  const secret = process.env.SOCIAL_DISPATCH_SECRET
  const supplied = req.headers.get("authorization") || ""
  const expected = `Bearer ${secret}`
  if (!secret || secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const limited = await rateLimit("delivery")
    if (limited) return limited
    return Response.json(await dispatchDeliveries(), { headers: { "Cache-Control": "no-store" } })
  } catch { return Response.json({ error: "Delivery unavailable" }, { status: 503 }) }
}
