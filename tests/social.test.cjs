const assert = require("node:assert/strict")
const test = require("node:test")
const load = require("./load-typescript.cjs")
const loadApp = require("./load-app.cjs")
const operation = { id: "07e144f7-ac73-4ea6-b132-aac39c12c965", revision: 1, attempts: 1, createdAt: "2026-10-07T00:00:00.000Z",
  desired: { publish: true, text: "Synthetic text", account: "synthetic" }, remote: {} }
const env = { MASTODON_INSTANCE_URL: "https://mastodon.example.test", MASTODON_ACCESS_TOKEN: "synthetic-secret",
  BLUESKY_IDENTIFIER: "synthetic", BLUESKY_PASSWORD: "synthetic-secret" }
function adapter(fetch, Agent = class {}) {
  class RichText { constructor({ text }) { this.text = text } async detectFacets() {} }
  return load("lib/social-provider.ts", { "@atproto/api": { BskyAgent: Agent, RichText },
    "./bluesky": { fetchLinkCard: async () => null } }, { process: { env }, fetch })
}
test("Mastodon create retries retain one idempotency key and bounded transport", async () => {
  const requests = []
  const api = adapter(async (url, init) => {
    requests.push({ url, init })
    return Response.json({ id: "123", url: "https://mastodon.example.test/@synthetic/123" })
  })
  await api.deliverSocial("mastodon", operation)
  await api.deliverSocial("mastodon", operation)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].init.headers["Idempotency-Key"], requests[1].init.headers["Idempotency-Key"])
  assert.equal(requests[0].init.headers["Idempotency-Key"], `blog-${operation.id}`)
  assert.equal(requests[0].init.redirect, "error")
  assert.ok(requests[0].init.signal instanceof AbortSignal)
})
test("Mastodon edits use retained IDs and already-deleted statuses succeed", async () => {
  const methods = []
  const api = adapter(async (url, init) => {
    assert.equal(url.pathname, "/api/v1/statuses/123")
    methods.push(init.method)
    return init.method === "PUT" ? Response.json({ id: "123", url: "https://mastodon.example.test/123" }) : new Response(null, { status: 404 })
  })
  const prior = { ...operation, remote: { id: "123" } }
  await api.deliverSocial("mastodon", prior)
  const removed = await api.deliverSocial("mastodon", { ...prior, desired: { ...prior.desired, publish: false } })
  assert.deepEqual(methods, ["PUT", "DELETE"])
  assert.equal(Object.keys(removed).length, 0)
})
test("provider errors propagate for durable retry without exposing response text", async () => {
  const api = adapter(async () => new Response("PRIVATE_PROVIDER_ERROR", { status: 429 }))
  await assert.rejects(api.deliverSocial("mastodon", operation), error => error.message === "Provider request failed")
  const malformed = adapter(async () => Response.json({ id: 123 }))
  await assert.rejects(malformed.deliverSocial("mastodon", operation), /Invalid provider response/)
})
test("Bluesky retry writes a stable record key and timestamp, never a second post", async () => {
  const records = []
  class Agent {
    session = { did: "did:plc:synthetic" }
    async login() {}
    com = { atproto: { repo: { async putRecord(input) {
      records.push(input)
      return { data: { uri: `at://${input.repo}/${input.collection}/${input.rkey}`, cid: "cid" } }
    } } } }
  }
  const api = adapter(() => { throw new Error("Unexpected network") }, Agent)
  const first = await api.deliverSocial("bluesky", operation)
  const second = await api.deliverSocial("bluesky", operation)
  assert.equal(first.uri, second.uri)
  assert.equal(records[0].rkey, `blog-${operation.id}`)
  assert.equal(records[0].record.createdAt, operation.createdAt)
  assert.equal(records[1].record.createdAt, operation.createdAt)
})
test("Bluesky edits preserve original creation time and reject another account's URI", async () => {
  let written
  class Agent {
    session = { did: "did:plc:synthetic" }
    async login() {}
    com = { atproto: { repo: {
      async getRecord() { return { data: { value: { createdAt: "2025-01-01T00:00:00.000Z" } } } },
      async putRecord(input) { written = input; return { data: { uri: "uri", cid: "cid" } } },
    } } }
  }
  const api = adapter(() => { throw new Error("Unexpected network") }, Agent)
  await api.deliverSocial("bluesky", { ...operation, remote: { uri: "at://did:plc:synthetic/app.bsky.feed.post/existing" } })
  assert.equal(written.rkey, "existing")
  assert.equal(written.record.createdAt, "2025-01-01T00:00:00.000Z")
  await assert.rejects(api.deliverSocial("bluesky", { ...operation, remote: { uri: "at://did:plc:foreign/app.bsky.feed.post/other" } }), /mismatch/)
})
test("post guards require exact revisions and valid creation keys", async () => {
  const app = loadApp({ "lib/dynamo.ts": {}, "lib/post-store.ts": {}, "lib/auth.ts": {}, "next-auth": {} })
  const guard = app("lib/mutation-guard.ts")
  assert.equal(guard.revisionFrom(new Request("https://example.test")).status, 428)
  for (const value of ["*", "1", '"-1"', '"01"', '"1", "2"', '"9999999999999999"']) {
    assert.equal(guard.revisionFrom(new Request("https://example.test", { headers: { "If-Match": value } })).status, 400)
  }
  assert.equal(guard.revisionFrom(new Request("https://example.test", { headers: { "If-Match": '"0"' } })), 0)
  assert.equal(guard.creationKey(new Request("https://example.test")).status, 400)
  assert.equal(guard.creationKey(new Request("https://example.test", { headers: { "Idempotency-Key": operation.id } })), operation.id)
})
test("owner checks reject old sessions after configured owner changes", async () => {
  const app = loadApp({ "lib/dynamo.ts": {}, "lib/post-store.ts": {}, "lib/auth.ts": {},
    "next-auth": { getServerSession: async () => ({ user: { email: "former@example.test" } }) } }, { process: { env: { ADMIN_EMAIL: "current@example.test" } } })
  assert.equal(await app("lib/mutation-guard.ts").isOwner(), false)
})
test("dispatch is disabled without a dedicated credential and rejects malformed auth before work", async () => {
  const route = load("app/api/social/dispatch/route.ts", { "@/lib/mutation-guard": {}, "@/lib/social-outbox": {} }, { process: { env: {} } })
  assert.equal((await route.POST(new Request("https://example.test", { method: "POST" }))).status, 401)
})
