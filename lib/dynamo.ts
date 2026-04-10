import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb"

const TABLE = process.env.DYNAMODB_TABLE_NAME ?? "BlogPosts"

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

const db = DynamoDBDocumentClient.from(client)

export type PostType = "note" | "essay" | "project" | "link"

export interface Post {
  pk: string
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

export async function getPostsByType(type: PostType): Promise<Post[]> {
  const result = await db.send(
    new ScanCommand({
      TableName: TABLE,
      // "type" is a DynamoDB reserved word — must alias it
      FilterExpression: "#t = :type AND published = :pub",
      ExpressionAttributeNames: { "#t": "type" },
      ExpressionAttributeValues: { ":type": type, ":pub": true },
    })
  )
  const posts = (result.Items ?? []) as Post[]
  return posts.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

export async function getAllPostsByType(type: PostType): Promise<Post[]> {
  const result = await db.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "#t = :type",
      ExpressionAttributeNames: { "#t": "type" },
      ExpressionAttributeValues: { ":type": type },
    })
  )
  const posts = (result.Items ?? []) as Post[]
  return posts.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

export async function getPublishedPosts(): Promise<Post[]> {
  const result = await db.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "published = :pub",
      ExpressionAttributeValues: { ":pub": true },
    })
  )
  const posts = (result.Items ?? []) as Post[]
  return posts.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

export async function getAllPosts(): Promise<Post[]> {
  const result = await db.send(new ScanCommand({ TableName: TABLE }))
  const posts = (result.Items ?? []) as Post[]
  return posts.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

export async function getPost(slug: string): Promise<Post | null> {
  const result = await db.send(
    new GetCommand({ TableName: TABLE, Key: { pk: slug } })
  )
  return (result.Item as Post) ?? null
}

export async function createPost(post: Post): Promise<void> {
  await db.send(
    new PutCommand({
      TableName: TABLE,
      Item: post,
      ConditionExpression: "attribute_not_exists(pk)",
    })
  )
}

export async function updatePost(
  slug: string,
  updates: Partial<Omit<Post, "pk">>
): Promise<void> {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined)
  const updateExpression =
    "SET " + entries.map((_, i) => `#k${i} = :v${i}`).join(", ")
  const expressionNames = Object.fromEntries(
    entries.map(([k], i) => [`#k${i}`, k])
  )
  const expressionValues = Object.fromEntries(
    entries.map(([, v], i) => [`:v${i}`, v])
  )

  await db.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: slug },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    })
  )
}

export async function deletePost(slug: string): Promise<void> {
  await db.send(
    new DeleteCommand({ TableName: TABLE, Key: { pk: slug } })
  )
}
