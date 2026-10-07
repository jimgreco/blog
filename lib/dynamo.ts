import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb"

export const TABLE = process.env.DYNAMODB_TABLE_NAME ?? "BlogPosts"

const client = new DynamoDBClient({
  region: process.env.DYNAMO_REGION ?? process.env.AWS_REGION ?? "us-east-1",
  ...(process.env.DYNAMODB_ENDPOINT
    ? {
        endpoint: process.env.DYNAMODB_ENDPOINT,
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : process.env.DYNAMO_ACCESS_KEY_ID
    ? {
        credentials: {
          accessKeyId: process.env.DYNAMO_ACCESS_KEY_ID,
          secretAccessKey: process.env.DYNAMO_SECRET_ACCESS_KEY!,
        },
      }
    : {}),
})

export const db = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } })

export type PostType = "note" | "essay" | "project" | "link"

export interface Post {
  pk: string
  revision?: number
  deleted?: boolean
  title: string
  body: string
  publishedAt: string
  published: boolean
  type: PostType
  link?: string
  bskyUri?: string
  bskyCid?: string
  bskyText?: string
  bskyLinkTarget?: "post" | "link" | "none"
  mastodonUri?: string
  mastodonId?: string
}

// Control records and deletion tombstones must never be exposed as posts.
export function isPost(value: unknown): value is Post {
  if (!value || typeof value !== "object") return false
  const item = value as Post
  return typeof item.pk === "string" && !item.pk.startsWith("!") && !item.deleted &&
    typeof item.title === "string" && typeof item.body === "string"
}
export function publicPost(post: Post): Post {
  // Never return outbox/control fields or private delivery payloads.
  return Object.fromEntries(Object.entries(post).filter(([key]) => [
    "pk", "title", "body", "publishedAt", "published", "type", "link",
    "bskyUri", "bskyCid", "mastodonUri", "mastodonId", "revision",
  ].includes(key))) as unknown as Post
}
async function scanPosts(type?: PostType, publishedOnly = false): Promise<Post[]> {
  const posts: Post[] = []
  let cursor: Record<string, unknown> | undefined
  do {
    const result = await db.send(new ScanCommand({
      TableName: TABLE, ExclusiveStartKey: cursor, ConsistentRead: true,
      FilterExpression: "attribute_exists(title) AND attribute_not_exists(deleted)" +
        (type ? " AND #t = :type" : "") + (publishedOnly ? " AND published = :pub" : ""),
      ...(type ? { ExpressionAttributeNames: { "#t": "type" } } : {}),
      ...(type || publishedOnly ? { ExpressionAttributeValues: {
        ...(type ? { ":type": type } : {}), ...(publishedOnly ? { ":pub": true } : {}),
      } } : {}),
    }))
    posts.push(...(result.Items ?? []).filter(isPost))
    cursor = result.LastEvaluatedKey
  } while (cursor)
  return posts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}
export const getPostsByType = (type: PostType) => scanPosts(type, true)
export const getAllPostsByType = (type: PostType) => scanPosts(type)
export const getPublishedPosts = () => scanPosts(undefined, true)
export const getAllPosts = () => scanPosts()
export async function getPost(slug: string): Promise<Post | null> {
  if (slug.startsWith("!")) return null
  const result = await db.send(new GetCommand({ TableName: TABLE, Key: { pk: slug }, ConsistentRead: true }))
  return isPost(result.Item) ? result.Item : null
}
