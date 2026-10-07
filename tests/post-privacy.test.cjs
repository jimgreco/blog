const assert = require("node:assert/strict")
const test = require("node:test")
const load = require("./load-typescript.cjs")

const postInput = load("lib/post-input.ts", {}, { process: { env: { NEXTAUTH_URL: "https://blog.example.test" } } })
const dependencies = (db) => ({
  "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
  "next/cache": {}, "next-auth": {}, "@/lib/auth": {},
  "@/lib/post-input": postInput, "@/lib/dynamo": { publicPost: p => p, ...db },
  "@/lib/post-store": db, "@/lib/mutation-guard": { isOwner: async () => true, rateLimit: async () => null, revisionFrom: () => 0 },
  "@/lib/post-response": { refreshPosts() {}, mutationFailure: error => { throw error } }, "@/lib/utils": {}, "@/lib/bluesky": {}, "@/lib/mastodon": {},
})

test("public single-post API hides drafts and missing records identically", async () => {
  for (const post of [null, { pk: "private-draft", published: false, body: "private" },
    { pk: "legacy", body: "private" }, { pk: "invalid", published: "true", body: "private" }]) {
    const route = load("app/api/posts/[slug]/route.ts", dependencies({ getPost: async () => post }))
    const response = await route.GET(null, { params: { slug: "private-draft" } })
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: "Not found" })
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
})

test("public single-post API serves published content, then hides it after unpublish", async () => {
  let post = { pk: "public", published: true, body: "visible" }
  const route = load("app/api/posts/[slug]/route.ts", dependencies({ getPost: async () => post }))
  assert.equal(route.dynamic, "force-dynamic")
  const first = await route.GET(null, { params: { slug: "public" } })
  assert.equal(first.status, 200)
  assert.equal(first.headers.get("cache-control"), "no-store")
  assert.deepEqual(await first.json(), post)
  post = { ...post, published: false }
  assert.equal((await route.GET(null, { params: { slug: "public" } })).status, 404)
})

test("public list API does not cache a previously published record", async () => {
  let posts = [{ pk: "public", published: true }]
  const route = load("app/api/posts/route.ts", dependencies({ getPublishedPosts: async () => posts }))
  assert.equal(route.dynamic, "force-dynamic")
  assert.equal((await route.GET()).headers.get("cache-control"), "no-store")
  posts = []
  assert.deepEqual(await (await route.GET()).json(), [])
})

test("saving a draft preserves its content without copying it to logs or syndicating it", async () => {
  const draft = {
    title: "SYNTHETIC_PRIVATE_TITLE", body: "SYNTHETIC_PRIVATE_BODY",
    bskyText: "SYNTHETIC_PRIVATE_SOCIAL_TEXT", published: false, type: "note",
    publishedAt: "2026-01-01T12:00:00.000Z", bskyLinkTarget: "post",
  }
  let saved
  const logs = []
  const deps = dependencies({
    getPost: async () => ({ pk: "synthetic-draft", ...draft }),
    savePost: async (slug, updates) => { saved = { slug, updates }; return { pk: slug, ...updates, revision: 1 } },
  })
  deps["next-auth"] = { getServerSession: async () => ({ user: { email: "owner@example.test" } }) }
  deps["next/cache"] = { revalidatePath() {} }
  // Social-provider stubs intentionally have no methods: any call would fail.
  const route = load("app/api/posts/[slug]/route.ts", deps, {
    console: Object.fromEntries(["log", "warn", "error"].map(level => [level, (...args) => logs.push(args)])),
  })
  const response = await route.PUT(new Request("https://blog.example.test/api/posts/synthetic-draft", {
    method: "PUT", headers: { origin: "https://blog.example.test", "content-type": "application/json" }, body: JSON.stringify(draft),
  }), { params: Promise.resolve({ slug: "synthetic-draft" }) })
  assert.equal(response.status, 200)
  assert.equal(saved.slug, "synthetic-draft")
  assert.equal(saved.updates.body, draft.body)
  assert.equal(saved.updates.bskyText, draft.bskyText)
  const logged = JSON.stringify(logs)
  for (const value of [draft.title, draft.body, draft.bskyText]) assert.ok(!logged.includes(value))
})
