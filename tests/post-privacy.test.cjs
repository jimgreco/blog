const assert = require("node:assert/strict")
const test = require("node:test")
const load = require("./load-typescript.cjs")

const dependencies = (db) => ({
  "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
  "next/cache": {}, "next-auth": {}, "@/lib/auth": {},
  "@/lib/dynamo": db, "@/lib/utils": {}, "@/lib/bluesky": {}, "@/lib/mastodon": {},
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
