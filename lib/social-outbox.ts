import { randomUUID } from "node:crypto"
import { GetCommand, PutCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb"
import { db, TABLE } from "./dynamo"
import { conditionalFailure } from "./post-store"
import { accountKey } from "./social-model"
import type { Operation, Outbox, Remote } from "./social-model"
import { deliverSocial } from "./social-provider"

const LEASE_MS = 120_000
export type DeliverySummary = { slug: string; provider: string; status: string; issue?: string; attempts: number }
export async function deliveryStatus(): Promise<DeliverySummary[]> {
  const rows: DeliverySummary[] = []
  let cursor: Record<string, unknown> | undefined
  do {
    const result = await db.send(new ScanCommand({ TableName: TABLE, ConsistentRead: true, ExclusiveStartKey: cursor,
      FilterExpression: "#kind = :kind", ExpressionAttributeNames: { "#kind": "kind", "#status": "status" }, ExpressionAttributeValues: { ":kind": "outbox" },
      ProjectionExpression: "slug, provider, #status, desiredRevision, completedRevision, issue, active.attempts",
    }))
    for (const value of result.Items ?? []) {
      const row = value as Outbox
      rows.push({ slug: row.slug, provider: row.provider,
        status: row.status === "delivered" && row.desiredRevision > row.completedRevision ? "pending" : row.status,
        ...(row.issue ? { issue: row.issue } : {}), attempts: row.active?.attempts ?? 0 })
    }
    cursor = result.LastEvaluatedKey
  } while (cursor)
  return rows
}
async function getJob(pk: string): Promise<Outbox | null> {
  return (await db.send(new GetCommand({ TableName: TABLE, Key: { pk }, ConsistentRead: true }))).Item as Outbox ?? null
}
async function block(job: Outbox, issue: string, token?: string): Promise<void> {
  await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk: job.pk },
    UpdateExpression: "SET #status = :blocked, issue = :issue REMOVE leaseToken, leaseUntil",
    ConditionExpression: token ? "leaseToken = :token" : "attribute_not_exists(leaseToken) AND desiredRevision = :revision",
    ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: {
      ":blocked": "blocked", ":issue": issue, ...(token ? { ":token": token } : { ":revision": job.desiredRevision }),
    },
  }))
}
export async function processDelivery(pk: string, now = Date.now()): Promise<boolean> {
  const job = await getJob(pk)
  if (!job || job.status === "blocked" || job.nextAttemptAt > now) return false
  if (job.leaseToken) {
    if ((job.leaseUntil ?? 0) <= now) {
      // Never steal a lease around an irreversible send: an interrupted process
      // can still have reached the provider. Fence completion and ask for review.
      try { await block(job, "interrupted_delivery", job.leaseToken) }
      catch (error) { if (!conditionalFailure(error)) throw error }
    }
    return false
  }
  if (!job.active && job.completedRevision >= job.desiredRevision) return false
  const operation: Operation = job.active ?? {
    id: randomUUID(), revision: job.desiredRevision, desired: job.desired,
    remote: job.remote, createdAt: new Date(now).toISOString(), attempts: 0,
  }
  const hasRemote = Boolean(operation.remote.uri || operation.remote.id)
  const needsSend = operation.desired.publish || hasRemote
  if (needsSend && (operation.desired.account !== accountKey(job.provider) ||
      (hasRemote && job.account !== operation.desired.account))) {
    try { await block(job, "account_configuration_changed") }
    catch (error) { if (!conditionalFailure(error)) throw error }
    return false
  }
  if (job.provider === "mastodon" && operation.desired.publish && !operation.remote.id &&
      operation.startedAt !== undefined && now - operation.startedAt >= 50 * 60_000) {
    try { await block(job, "ambiguous_create_requires_reconciliation") }
    catch (error) { if (!conditionalFailure(error)) throw error }
    return false
  }
  const token = randomUUID()
  const active = { ...operation, startedAt: operation.startedAt ?? now, attempts: operation.attempts + 1 }
  try {
    await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk },
      UpdateExpression: "SET active = :active, leaseToken = :token, leaseUntil = :until, #status = :sending REMOVE issue",
      ConditionExpression: "attribute_not_exists(leaseToken) AND desiredRevision = :revision AND #status <> :blocked AND " +
        (job.active ? "active.id = :id AND active.attempts = :attempts" : "attribute_not_exists(active)"),
      ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: {
        ":active": active, ":token": token, ":until": now + LEASE_MS, ":sending": "sending", ":revision": job.desiredRevision, ":blocked": "blocked",
        ...(job.active ? { ":id": job.active.id, ":attempts": job.active.attempts } : {}),
      },
    }))
  } catch (error) { if (conditionalFailure(error)) return false; throw error }
  let remote: Remote
  try {
    remote = needsSend ? await deliverSocial(job.provider, active) : {}
  } catch {
    // Ambiguous failures retry the SAME immutable operation and provider key.
    const exhausted = active.attempts >= 8
    await db.send(new UpdateCommand({ TableName: TABLE, Key: { pk },
      UpdateExpression: "SET #status = :status, nextAttemptAt = :next, issue = :issue REMOVE leaseToken, leaseUntil",
      ConditionExpression: "leaseToken = :token",
      ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: {
        ":token": token, ":status": exhausted ? "blocked" : "retry",
        ":next": Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (active.attempts - 1)),
        ":issue": exhausted ? "retry_limit_requires_review" : "provider_unavailable",
      },
    }))
    return true
  }
  const bsky = job.provider === "bluesky"
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: TABLE, Key: { pk },
        UpdateExpression: "SET remote = :remote, account = :account, completedRevision = :revision, nextAttemptAt = :zero, #status = :delivered REMOVE active, leaseToken, leaseUntil, issue",
        ConditionExpression: "leaseToken = :token",
        ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: {
          ":token": token, ":remote": remote, ":account": active.desired.account, ":revision": active.revision, ":zero": 0, ":delivered": "delivered",
        },
      } },
      { Update: { TableName: TABLE, Key: { pk: job.slug }, ConditionExpression: "attribute_exists(pk)",
        UpdateExpression: "SET #uri = :uri, #id = :id",
        ExpressionAttributeNames: { "#uri": bsky ? "bskyUri" : "mastodonUri", "#id": bsky ? "bskyCid" : "mastodonId" },
        ExpressionAttributeValues: { ":uri": remote.uri ?? null, ":id": (bsky ? remote.cid : remote.id) ?? null },
      } },
    ] }))
  } catch (error) {
    // Keep the claimed operation after an unconfirmed acknowledgement. An
    // expired claim is blocked, never blindly resent or silently discarded.
    if (!conditionalFailure(error)) throw error
  }
  return true
}
export async function dispatchDeliveries(): Promise<{ processed: number }> {
  // Persist a scan cursor so a large table cannot starve later records. Each
  // invocation examines <=100 rows and makes <=1 bounded provider operation.
  const cursor = (await db.send(new GetCommand({ TableName: TABLE, Key: { pk: "!delivery-cursor" }, ConsistentRead: true }))).Item?.cursor
  const page = await db.send(new ScanCommand({ TableName: TABLE, Limit: 100, ConsistentRead: true,
    ExclusiveStartKey: cursor || undefined, FilterExpression: "#kind = :kind",
    ExpressionAttributeNames: { "#kind": "kind" }, ExpressionAttributeValues: { ":kind": "outbox" },
  }))
  let processed = 0
  let resume: Record<string, unknown> | undefined = page.LastEvaluatedKey
  for (const row of page.Items ?? []) {
    if (await processDelivery(row.pk)) processed++
    if (processed >= 1) { resume = { pk: row.pk }; break }
  }
  await db.send(new PutCommand({ TableName: TABLE, Item: { pk: "!delivery-cursor", kind: "cursor", cursor: resume ?? null } }))
  return { processed }
}
