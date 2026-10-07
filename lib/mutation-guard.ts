import { getServerSession } from "next-auth"
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import { authOptions } from "./auth"
import { db, TABLE } from "./dynamo"
import { conditionalFailure } from "./post-store"

export async function isOwner(): Promise<boolean> {
  const session = await getServerSession(authOptions)
  return Boolean(process.env.ADMIN_EMAIL && session?.user?.email === process.env.ADMIN_EMAIL)
}
export function revisionFrom(req: Request): number | Response {
  const value = req.headers.get("if-match")
  if (!value) return Response.json({ error: "Reload the editor before saving; a revision is required." }, { status: 428 })
  if (!/^"(0|[1-9]\d{0,14})"$/.test(value)) return Response.json({ error: "Invalid revision." }, { status: 400 })
  return Number(value.slice(1, -1))
}
export function creationKey(req: Request): string | Response {
  const value = req.headers.get("idempotency-key")
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return Response.json({ error: "A valid save key is required. Reload the editor." }, { status: 400 })
  }
  return value.toLowerCase()
}
// A fixed number of shared records; no client IP trust and no per-instance bypass.
export async function rateLimit(scope: "mutations" | "delivery", limit = scope === "delivery" ? 10 : 30): Promise<Response | null> {
  const now = Date.now()
  const bucket = Math.floor(now / 60000)
  const key = { pk: `!rate#${scope}` }
  const increment = () => db.send(new UpdateCommand({ TableName: TABLE, Key: key,
      UpdateExpression: "SET #n = #n + :one",
      ConditionExpression: "#w = :w AND #n < :limit",
      ExpressionAttributeNames: { "#w": "window", "#n": "count" },
      ExpressionAttributeValues: { ":w": bucket, ":one": 1, ":limit": limit },
    }))
  try {
    await increment()
    return null
  } catch (error) { if (!conditionalFailure(error)) throw error }
  try {
    await db.send(new PutCommand({ TableName: TABLE, Item: { ...key, kind: "rate", window: bucket, count: 1 },
      ConditionExpression: "attribute_not_exists(pk) OR #w < :w",
      ExpressionAttributeNames: { "#w": "window" }, ExpressionAttributeValues: { ":w": bucket },
    }))
    return null
  } catch (error) { if (!conditionalFailure(error)) throw error }
  // Another request may have initialized the new window while we waited.
  try { await increment(); return null }
  catch (error) { if (!conditionalFailure(error)) throw error }
  return Response.json({ error: "Too many requests. Please wait before trying again." },
    { status: 429, headers: { "Retry-After": String(Math.ceil((60000 - now % 60000) / 1000)) } })
}
