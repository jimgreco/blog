const { randomUUID } = require("node:crypto")
const { DynamoDBClient, CreateTableCommand, DeleteTableCommand } = require("@aws-sdk/client-dynamodb")
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb")
module.exports = async function fixture() {
  const endpoint = process.env.BLOG_TEST_DYNAMODB_ENDPOINT
  if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Set BLOG_TEST_DYNAMODB_ENDPOINT to an isolated loopback DynamoDB Local port")
  const table = `BlogSynthetic-${randomUUID()}`
  const client = new DynamoDBClient({ endpoint, region: "us-east-1", credentials: { accessKeyId: "synthetic", secretAccessKey: "synthetic" } })
  await client.send(new CreateTableCommand({ TableName: table, KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }], BillingMode: "PAY_PER_REQUEST" }))
  const db = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } })
  return { endpoint, table, db, env: { DYNAMODB_ENDPOINT: endpoint, DYNAMODB_TABLE_NAME: table, DYNAMO_REGION: "us-east-1",
    ADMIN_EMAIL: "owner@example.test", NEXTAUTH_URL: "https://blog.example.test",
    BLUESKY_IDENTIFIER: "synthetic", BLUESKY_PASSWORD: "synthetic", MASTODON_INSTANCE_URL: "https://mastodon.example.test", MASTODON_ACCESS_TOKEN: "synthetic" },
    async close() { await client.send(new DeleteTableCommand({ TableName: table })); client.destroy() } }
}
