import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb"
import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb"
import { db, TABLE, getPost } from "./dynamo"
import type { Post } from "./dynamo"
import type { PostInput } from "./post-input"
import { accountKey, desiredFor, fingerprint, outboxKey, providers, remoteFor } from "./social-model"
import { slugify } from "./utils"

type Write = NonNullable<TransactWriteCommandInput["TransactItems"]>[number]
export class Conflict extends Error {}
export function conditionalFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false
  if (error.name === "ConditionalCheckFailedException") return true
  return error.name === "TransactionCanceledException" && "CancellationReasons" in error &&
    Array.isArray(error.CancellationReasons) && error.CancellationReasons.some(reason => reason?.Code === "ConditionalCheckFailed")
}
function outboxWrites(post: Post): Write[] {
  return providers.map(provider => ({ Update: {
    TableName: TABLE, Key: { pk: outboxKey(post.pk, provider) },
    UpdateExpression: "SET #kind = :kind, slug = :slug, provider = :provider, desired = :desired, desiredRevision = :revision, completedRevision = if_not_exists(completedRevision, :zero), remote = if_not_exists(remote, :remote), nextAttemptAt = if_not_exists(nextAttemptAt, :zero), #status = if_not_exists(#status, :pending), account = if_not_exists(account, :account)",
    ExpressionAttributeNames: { "#kind": "kind", "#status": "status" },
    ExpressionAttributeValues: { ":kind": "outbox", ":slug": post.pk, ":provider": provider,
      ":desired": desiredFor(post, provider), ":revision": post.revision, ":zero": 0,
      ":remote": remoteFor(post, provider), ":pending": "pending", ":account": accountKey(provider) },
  } }))
}
async function receipt(key: string, hash: string): Promise<Post | null> {
  const result = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: `!create#${key}` }, ConsistentRead: true }))
  if (!result.Item) return null
  if (result.Item.hash !== hash) throw new Conflict("This save key was already used for different content. Your text is still here; copy it before reloading.")
  const post = await getPost(result.Item.slug)
  if (!post) throw new Conflict("This post was already created and subsequently deleted.")
  return post
}
export async function createPost(input: PostInput, key: string): Promise<Post> {
  const hash = fingerprint(input)
  const replay = await receipt(key, hash)
  if (replay) return replay
  const base = slugify(input.title) || "post"
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt ? `${base}-${attempt}` : base
    const post: Post = { ...input, pk: slug, revision: 1 }
    try {
      await db.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: TABLE, Item: post, ConditionExpression: "attribute_not_exists(pk)" } },
        { Put: { TableName: TABLE, Item: { pk: `!create#${key}`, kind: "receipt", hash, slug }, ConditionExpression: "attribute_not_exists(pk)" } },
        ...outboxWrites(post),
      ] }))
      return post
    } catch (error) {
      if (!conditionalFailure(error)) throw error
      const replay = await receipt(key, hash)
      if (replay) return replay
    }
  }
  throw new Conflict("Too many posts have this title. Choose a more specific title.")
}
export async function savePost(slug: string, input: PostInput | null, expected: number): Promise<Post> {
  const existing = await getPost(slug)
  if (!existing || (existing.revision ?? 0) !== expected) throw new Conflict("This post changed in another tab. Your text is still here; copy it before reloading.")
  const post: Post = input ? { ...existing, ...input, link: input.link ?? "", revision: expected + 1 }
    : { pk: slug, title: "", body: "", publishedAt: existing.publishedAt, type: existing.type,
        published: false, deleted: true, revision: expected + 1,
        ...remoteForPost(existing) }
  const fields = input ? { ...input, link: input.link ?? "", revision: post.revision }
    : { title: "", body: "", link: "", bskyText: "", published: false, deleted: true, revision: post.revision }
  const entries = Object.entries(fields)
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: TABLE, Key: { pk: slug },
        ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(deleted) AND " +
          (expected === 0 ? "attribute_not_exists(revision)" : "revision = :expected"),
        UpdateExpression: "SET " + entries.map((_, i) => `#k${i} = :v${i}`).join(", "),
        ExpressionAttributeNames: Object.fromEntries(entries.map(([key], i) => [`#k${i}`, key])),
        ExpressionAttributeValues: { ...Object.fromEntries(entries.map(([, value], i) => [`:v${i}`, value])),
          ...(expected === 0 ? {} : { ":expected": expected }) },
      } }, ...outboxWrites(post),
    ] }))
  } catch (error) {
    if (conditionalFailure(error)) throw new Conflict("This post changed in another tab. Your text is still here; copy it before reloading.")
    throw error
  }
  return post
}
function remoteForPost(post: Post) {
  return { bskyUri: post.bskyUri, bskyCid: post.bskyCid, mastodonUri: post.mastodonUri, mastodonId: post.mastodonId }
}
