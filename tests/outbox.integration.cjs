const assert = require("node:assert/strict")
const { randomUUID } = require("node:crypto")
const { GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb")
const createFixture = require("./dynamo-fixture.cjs")
const loadApp = require("./load-app.cjs")
async function main() {
  const fixture = await createFixture()
  const calls = []
  let fail = false
  let pause
  const app = loadApp({ "lib/social-provider.ts": { async deliverSocial(provider, operation) {
    calls.push({ provider, operation: structuredClone(operation) })
    if (pause) await pause
    if (fail) throw new Error("SYNTHETIC_PROVIDER_UNAVAILABLE")
    if (!operation.desired.publish) return {}
    return provider === "bluesky" ? { uri: `at://synthetic/app.bsky.feed.post/${operation.id}`, cid: "synthetic-cid" }
      : { uri: "https://mastodon.example.test/@synthetic/123", id: "123" }
  } }, "next-auth": { getServerSession: async () => ({ user: { email: "owner@example.test" } }) }, "lib/auth.ts": {} }, { process: { env: fixture.env } })
  const store = app("lib/post-store.ts")
  const dynamo = app("lib/dynamo.ts")
  const outbox = app("lib/social-outbox.ts")
  const guard = app("lib/mutation-guard.ts")
  const model = app("lib/social-model.ts")
  const get = async pk => (await fixture.db.send(new GetCommand({ TableName: fixture.table, Key: { pk }, ConsistentRead: true }))).Item
  const put = item => fixture.db.send(new PutCommand({ TableName: fixture.table, Item: item }))
  const input = { title: "Synthetic title", body: "private draft", type: "note", published: false,
    publishedAt: "2026-10-07T00:00:00.000Z", bskyText: "social text", bskyLinkTarget: "none" }
  try {
    // Database transactions are exercised against the actual DynamoDB engine.
    const key = randomUUID()
    const first = await store.createPost(input, key)
    assert.equal(first.revision, 1)
    assert.equal((await store.createPost(input, key)).pk, first.pk)
    await assert.rejects(store.createPost({ ...input, body: "changed" }, key), /different content/)
    assert.equal((await dynamo.getAllPosts()).length, 1)
    assert.equal((await dynamo.getPublishedPosts()).length, 0)
    for (const provider of model.providers) await outbox.processDelivery(model.outboxKey(first.pk, provider))
    assert.equal(calls.length, 0, "a draft never reaches a provider")
    const competing = await Promise.allSettled([
      store.savePost(first.pk, { ...input, body: "winner one" }, 1),
      store.savePost(first.pk, { ...input, body: "winner two" }, 1),
    ])
    assert.equal(competing.filter(r => r.status === "fulfilled").length, 1)
    assert.equal((await dynamo.getPost(first.pk)).revision, 2)
    await assert.rejects(store.savePost(first.pk, null, 1), /another tab/)
    const published = await store.savePost(first.pk, { ...input, published: true }, 2)
    const bsky = model.outboxKey(first.pk, "bluesky")
    const masto = model.outboxKey(first.pk, "mastodon")
    let resume
    pause = new Promise(resolve => { resume = resolve })
    const inFlight = outbox.processDelivery(bsky)
    for (let attempt = 0; calls.length === 0 && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(calls.length, 1)
    assert.equal(await outbox.processDelivery(bsky), false, "two workers cannot claim a send")
    const changed = await store.savePost(first.pk, { ...input, published: true, bskyText: "new desired text" }, published.revision)
    resume(); pause = null
    await inFlight
    assert.equal((await dynamo.getPost(first.pk)).bskyText, "new desired text", "delivery never overwrites newer content")
    assert.equal((await get(bsky)).completedRevision, published.revision)
    await outbox.processDelivery(bsky)
    assert.equal(calls.at(-1).operation.desired.text, "new desired text")
    assert.equal(calls.at(-1).operation.remote.uri, calls[0] && `at://synthetic/app.bsky.feed.post/${calls[0].operation.id}`)
    // A lost provider response keeps its immutable operation/key even after an edit.
    fail = true
    await outbox.processDelivery(masto)
    const failed = await get(masto)
    assert.equal(failed.status, "retry")
    assert.ok(failed.nextAttemptAt > Date.now())
    const saved = await store.savePost(first.pk, { ...input, published: true, bskyText: "third text" }, changed.revision)
    fail = false
    await outbox.processDelivery(masto, failed.nextAttemptAt + 1)
    assert.equal(calls.at(-1).operation.id, failed.active.id)
    assert.equal(calls.at(-1).operation.desired.text, "new desired text")
    await outbox.processDelivery(masto)
    assert.equal(calls.at(-1).operation.remote.id, "123")
    assert.equal(calls.at(-1).operation.desired.text, "third text")
    // An unpublish commits immediately and retains failed deletion targets.
    await store.savePost(first.pk, { ...input, published: false }, saved.revision)
    assert.equal((await dynamo.getPublishedPosts()).length, 0)
    fail = true
    await outbox.processDelivery(masto)
    const deletion = await get(masto)
    assert.equal(deletion.active.remote.id, "123")
    assert.equal(deletion.remote.id, "123")
    fail = false
    await outbox.processDelivery(masto, deletion.nextAttemptAt + 1)
    assert.deepEqual((await get(masto)).remote, {})
    await store.savePost(first.pk, null, saved.revision + 1)
    assert.equal(await dynamo.getPost(first.pk), null)
    assert.equal((await dynamo.getAllPosts()).length, 0)
    assert.equal((await get(first.pk)).body, "")
    await assert.rejects(store.savePost(first.pk, input, saved.revision + 2), /another tab/)
    await assert.rejects(store.createPost(input, key), /deleted/)
    // Legacy revision zero and legacy provider references survive first edit.
    await put({ ...input, pk: "legacy", mastodonId: "999", mastodonUri: "https://mastodon.example.test/999" })
    await store.savePost("legacy", { ...input, published: true }, 0)
    assert.equal((await get(model.outboxKey("legacy", "mastodon"))).remote.id, "999")
    await assert.rejects(store.savePost("legacy", input, 0), /another tab/)
    // An ambiguous old Mastodon create and an expired worker claim stop safely.
    const uncertain = { ...failed, pk: model.outboxKey("uncertain", "mastodon"), slug: "uncertain", nextAttemptAt: 0,
      active: { ...failed.active, startedAt: Date.now() - 51 * 60_000 } }
    await put(uncertain)
    const before = calls.length
    await outbox.processDelivery(uncertain.pk)
    assert.equal((await get(uncertain.pk)).issue, "ambiguous_create_requires_reconciliation")
    await put({ ...failed, pk: model.outboxKey("interrupted", "mastodon"), slug: "interrupted", nextAttemptAt: 0,
      leaseToken: "stale-token", leaseUntil: 1 })
    await outbox.processDelivery(model.outboxKey("interrupted", "mastodon"))
    assert.equal((await get(model.outboxKey("interrupted", "mastodon"))).issue, "interrupted_delivery")
    assert.equal(calls.length, before)
    await put({ ...failed, pk: model.outboxKey("wrong-account", "mastodon"), nextAttemptAt: 0,
      active: { ...failed.active, desired: { ...failed.active.desired, account: "wrong-account" } } })
    await outbox.processDelivery(model.outboxKey("wrong-account", "mastodon"))
    assert.equal((await get(model.outboxKey("wrong-account", "mastodon"))).issue, "account_configuration_changed")
    await put({ ...failed, pk: model.outboxKey("changed-owner-with-ref", "mastodon"), active: undefined, nextAttemptAt: 0,
      remote: { id: "123" }, account: "old-account", completedRevision: 0 })
    await outbox.processDelivery(model.outboxKey("changed-owner-with-ref", "mastodon"))
    assert.equal((await get(model.outboxKey("changed-owner-with-ref", "mastodon"))).issue, "account_configuration_changed")
    // Status/read projections contain neither content nor credential fingerprints.
    const status = await outbox.deliveryStatus()
    assert.ok(status.some(row => row.status === "blocked"))
    assert.ok(!JSON.stringify(status).includes("social text"))
    assert.ok(!JSON.stringify(status).includes("account\":"))
    const results = await Promise.all(Array.from({ length: 35 }, () => guard.rateLimit("mutations")))
    assert.equal(results.filter(r => r === null).length, 30)
    assert.equal(results.filter(r => r?.status === 429).length, 5)
    // Failed persistence cannot enqueue partial work or erase an existing outbox.
    const beforeConflict = await get(model.outboxKey("legacy", "bluesky"))
    await assert.rejects(store.savePost("legacy", { ...input, bskyText: "must not queue" }, 0))
    assert.deepEqual(await get(model.outboxKey("legacy", "bluesky")), beforeConflict)
    // Cursor-driven dispatcher and skipped no-op jobs use valid Dynamo expressions.
    await outbox.dispatchDeliveries()
    // Verify a maximum-size editor payload still fits the DynamoDB item limit
    // because snapshots contain only the social text (never a full duplicate body).
    await store.createPost({ ...input, title: "Large synthetic draft", body: "x".repeat(250000) }, randomUUID())
    assert.ok((await dynamo.getAllPosts()).some(p => p.body.length === 250000))
    // Stale lease completion is fenced at the database transaction boundary.
    const blocked = await get(model.outboxKey("interrupted", "mastodon"))
    assert.equal(blocked.leaseToken, undefined)
    await assert.rejects(fixture.db.send(new UpdateCommand({ TableName: fixture.table, Key: { pk: blocked.pk },
      UpdateExpression: "SET issue = :issue", ConditionExpression: "leaseToken = :token",
      ExpressionAttributeValues: { ":issue": "must-not-write", ":token": "stale-token" } })))
    console.log("PASS: real DynamoDB transactions; create replay, races, stale writes/deletes, drafts, legacy records, two workers, immutable retries, publication changes, deletion retention, ambiguous sends, account binding, shared rate limits, projections, scan cursor, maximum payload, fenced completion")
  } finally { dynamo.db.destroy(); await fixture.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
