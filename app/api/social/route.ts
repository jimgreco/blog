import { isOwner, rateLimit } from "@/lib/mutation-guard"
import { mutationOriginError } from "@/lib/post-input"
import { deliveryStatus, dispatchDeliveries } from "@/lib/social-outbox"
export const dynamic = "force-dynamic"
export async function GET() {
  if (!await isOwner()) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json(await deliveryStatus(), { headers: { "Cache-Control": "no-store" } })
}
export async function POST(req: Request) {
  if (!await isOwner()) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const originError = mutationOriginError(req)
  if (originError) return originError
  try {
    const limited = await rateLimit("delivery")
    if (limited) return limited
    return Response.json(await dispatchDeliveries(), { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Delivery could not be confirmed. Saved posts are safe; check status before retrying." }, { status: 503 })
  }
}
