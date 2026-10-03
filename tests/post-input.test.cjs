const assert = require("node:assert/strict")
const test = require("node:test")
const load = require("./load-typescript.cjs")
const origin = "https://blog.example.test"
const input = load("lib/post-input.ts", {}, { process: { env: { NEXTAUTH_URL: origin } } })
const draft = { title: "Synthetic draft", body: "Synthetic body", type: "note", published: false,
  publishedAt: "2026-01-01T12:00:00.000Z", bskyText: "", bskyLinkTarget: "post" }
const request = (value = draft, headers = {}) => new Request(origin + "/api/posts", {
  method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(value),
})

function routes(session = {}) {
  const calls = []
  const sideEffect = name => async (...args) => { calls.push([name, ...args]); return null }
  const deps = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "next/cache": { revalidatePath: sideEffect("revalidate") },
    "next-auth": { getServerSession: async () => session }, "@/lib/auth": {},
    "@/lib/post-input": input, "@/lib/utils": { slugify: () => "synthetic-new" },
    "@/lib/dynamo": { getPost: sideEffect("get"), createPost: sideEffect("create"),
      updatePost: sideEffect("update"), deletePost: sideEffect("delete") },
    "@/lib/bluesky": Object.fromEntries(["postToBluesky", "updateBlueskyPost", "deleteBlueskyPost"].map(name => [name, sideEffect(name)])),
    "@/lib/mastodon": Object.fromEntries(["postToMastodon", "updateMastodonPost", "deleteMastodonPost"].map(name => [name, sideEffect(name)])),
  }
  const globals = { process: { env: {} } }
  return { calls, deps, create: load("app/api/posts/route.ts", deps, globals),
    single: load("app/api/posts/[slug]/route.ts", deps, globals) }
}
const context = { params: Promise.resolve({ slug: "synthetic" }) }

test("mutation origins reject missing, opaque, sibling, wrong scheme/port and spoofed hosts", async () => {
  for (const supplied of [undefined, "null", "https://evil.example.test", "https://sub.blog.example.test", "http://blog.example.test", origin + ":8443", origin + "/"]) {
    const req = request()
    if (supplied === undefined) req.headers.delete("origin")
    else req.headers.set("origin", supplied)
    req.headers.set("host", "evil.example.test")
    req.headers.set("x-forwarded-host", "evil.example.test")
    assert.equal(input.mutationOriginError(req).status, 403)
    assert.equal(req.bodyUsed, false)
  }
  assert.equal(input.mutationOriginError(request()), null)
  for (const configured of [undefined, "bad", "file:///tmp/test"]) {
    const helper = load("lib/post-input.ts", {}, { process: { env: { NEXTAUTH_URL: configured } } })
    assert.equal(helper.mutationOriginError(request()).status, 500)
  }
})

test("all three mutation routes authenticate and reject origins before database/provider calls", async () => {
  for (const session of [null, {}]) {
    const { create, single, calls } = routes(session)
    for (const action of [req => create.POST(req), req => single.PUT(req, context), req => single.DELETE(req, context)]) {
      const result = await action(request(draft, { origin: "https://evil.example.test" }))
      assert.equal(result.status, session ? 403 : 401)
      assert.equal(calls.length, 0)
    }
  }
})

test("valid complete editor payloads retain all post types, empty text and optional HTTP links", async () => {
  for (const type of ["note", "essay", "project", "link"]) {
    for (const link of [undefined, "", "http://example.test", "https://example.test/a?q=x#here"]) {
      const payload = { ...draft, type, link, title: "  Trimmed  ", body: "", published: true }
      const result = await input.readPostInput(request(payload))
      assert.equal(result.error, undefined)
      assert.equal(result.input.title, "Trimmed")
      assert.equal(result.input.body, "")
      assert.equal(result.input.link, link)
      assert.equal(result.input.published, true)
    }
  }
})

test("schema rejects partial edits, field type confusion, invalid dates, unsafe links and injected fields", async () => {
  const invalid = [null, [], "text", 42, {},
    ...Object.keys(draft).map(key => Object.fromEntries(Object.entries(draft).filter(([name]) => name !== key))),
    ...["title", "body", "publishedAt", "bskyText"].flatMap(key => [null, [], {}].map(value => ({ ...draft, [key]: value }))),
    ...[{ title: " " }, { title: "a".repeat(513) }, { published: "false" }, { published: 0 },
      { type: "admin" }, { bskyLinkTarget: "javascript:" }, { bskyText: "x".repeat(10001) },
      { publishedAt: "yesterday" }, { publishedAt: "2026-02-30T12:00:00Z" },
      { link: "javascript:alert(1)" }, { link: "data:text/html,test" }, { link: "/relative" },
      { link: "https://user:pass@example.test" }, { link: "https://example.test/" + "x".repeat(4096) },
      { link: {} }, { pk: "overwrite" }, { bskyUri: "injected" }].map(fields => ({ ...draft, ...fields })),
  ]
  for (const payload of invalid) {
    const { create, single, calls } = routes()
    assert.equal((await create.POST(request(payload))).status, 400)
    assert.equal((await single.PUT(request(payload), context)).status, 400)
    assert.equal(calls.length, 0)
  }
})

test("malformed JSON, UTF-8 and content types receive bounded client errors", async () => {
  for (const body of ["{broken", "", new Uint8Array([0xff, 0xfe])]) {
    const req = new Request(origin, { method: "POST", headers: { origin, "content-type": "application/json" }, body })
    assert.equal((await input.readPostInput(req)).error.status, 400)
  }
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data", ""]) {
    assert.equal((await input.readPostInput(request(draft, { "content-type": type }))).error.status, 415)
  }
  assert.ok((await input.readPostInput(request(draft, { "content-type": "Application/JSON; charset=utf-8" }))).input)
})

test("byte boundary is enforced with absent, correct and understated Content-Length", async () => {
  const overhead = Buffer.byteLength(JSON.stringify({ ...draft, body: "" }))
  const limit = { ...draft, body: "x".repeat(input.MAX_POST_BYTES - overhead) }
  assert.ok((await input.readPostInput(request(limit))).input)
  for (const headers of [{}, { "content-length": "1" }, { "content-length": String(input.MAX_POST_BYTES + 1) }]) {
    assert.equal((await input.readPostInput(request({ ...limit, body: limit.body + "x" }, headers))).error.status, 413)
  }
  assert.equal((await input.readPostInput(request({ ...draft, body: "😀".repeat(70000) }))).error.status, 413)
})

test("oversized chunked streams are canceled without reading the remainder", async () => {
  let canceled = false
  let pulled = 0
  const stream = new ReadableStream({
    pull(controller) { pulled++; controller.enqueue(new Uint8Array(150000)); },
    cancel() { canceled = true },
  }, { highWaterMark: 0 })
  const req = new Request(origin, { method: "POST", headers: { origin, "content-type": "application/json" }, body: stream, duplex: "half" })
  assert.equal((await input.readPostInput(req)).error.status, 413)
  assert.equal(canceled, true)
  assert.equal(pulled, 2)
})

test("valid draft creation and deletion reach only the expected stubbed persistence", async () => {
  const { create, single, calls } = routes()
  assert.equal((await create.POST(request())).status, 201)
  assert.equal(calls.filter(([name]) => name === "create").length, 1)
  assert.equal((await single.DELETE(request(), context)).status, 200)
  assert.equal(calls.filter(([name]) => name === "delete").length, 1)
  assert.ok(calls.every(([name]) => ["get", "create", "delete", "revalidate"].includes(name)))
})
