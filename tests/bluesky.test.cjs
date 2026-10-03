const assert = require("node:assert/strict")
const test = require("node:test")
const load = require("./load-typescript.cjs")

function fixture(getRecord) {
  let written
  class Agent {
    com = { atproto: { repo: {
      getRecord,
      async putRecord(input) {
        written = input
        return { data: { uri: "at://synthetic/app.bsky.feed.post/one", cid: "synthetic-new-cid" } }
      },
    } } }
    async login() {}
  }
  class RichText {
    constructor({ text }) { this.text = text }
    async detectFacets() { this.facets = [{ index: { byteStart: 0, byteEnd: 4 }, features: [] }] }
  }
  const api = load("lib/bluesky.ts", {
    "@atproto/api": { BskyAgent: Agent, RichText },
    "./public-fetch": { fetchPublicPreview() { throw new Error("Unexpected network request") } },
  }, {
    process: { env: { BLUESKY_IDENTIFIER: "synthetic", BLUESKY_PASSWORD: "synthetic" } },
    console: { log() {}, warn() {}, error() {} },
  })
  return { api, written: () => written }
}

test("Bluesky edits preserve the original timestamp and typed post fields", async () => {
  const createdAt = "2025-01-02T03:04:05.000Z"
  const { api, written } = fixture(async () => ({ data: { value: { createdAt } } }))
  const result = await api.updateBlueskyPost("at://synthetic/app.bsky.feed.post/one", "old-cid", "Edited synthetic post")
  assert.equal(result.cid, "synthetic-new-cid")
  assert.equal(written().repo, "synthetic")
  assert.equal(written().collection, "app.bsky.feed.post")
  assert.equal(written().rkey, "one")
  assert.equal(written().record.$type, "app.bsky.feed.post")
  assert.equal(written().record.text, "Edited synthetic post")
  assert.equal(written().record.createdAt, createdAt)
  assert.equal(written().record.facets.length, 1)
  assert.equal(written().record.embed, undefined)
})

test("Bluesky edits tolerate malformed original timestamps and failed lookups", async () => {
  for (const getRecord of [
    async () => ({ data: { value: null } }),
    async () => ({ data: { value: { createdAt: 123 } } }),
    async () => { throw new Error("Synthetic lookup failure") },
  ]) {
    const { api, written } = fixture(getRecord)
    const before = Date.now()
    const result = await api.updateBlueskyPost("at://synthetic/app.bsky.feed.post/one", "old-cid", "Edited")
    assert.equal(result.cid, "synthetic-new-cid")
    const timestamp = Date.parse(written().record.createdAt)
    assert.ok(timestamp >= before && timestamp <= Date.now())
  }
})
