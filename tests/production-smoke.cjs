const assert = require("node:assert/strict")
const { createServer } = require("node:http")
const { spawn } = require("node:child_process")
const { once } = require("node:events")
const { encode } = require("next-auth/jwt")

// Run only after a production build with the synthetic variables documented in
// this audit. DynamoDB is a loopback protocol fixture, never a real AWS service.
async function main() {
  const secret = "synthetic-audit-session-key-not-for-production"
  const posts = ["note", "essay", "project", "link"].map(type => ({
    pk: `synthetic-${type}`, title: `Synthetic ${type}`, type,
    body: `Synthetic public ${type} body`, published: true, publishedAt: "2026-01-01T12:00:00Z",
  }))
  posts.push({ pk: "synthetic-draft", title: "Private synthetic draft", type: "note",
    body: "NEVER_PUBLIC_SYNTHETIC_BODY", published: false, publishedAt: "2026-01-01T12:00:00Z" })
  const fixture = await require("./dynamo-fixture.cjs")()
  const { PutCommand } = require("@aws-sdk/lib-dynamodb")
  for (const post of posts) await fixture.db.send(new PutCommand({ TableName: fixture.table, Item: post }))
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: {
      PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      AWS_EC2_METADATA_DISABLED: "true", AWS_ACCESS_KEY_ID: "synthetic", AWS_SECRET_ACCESS_KEY: "synthetic",
      DYNAMODB_ENDPOINT: fixture.endpoint, DYNAMODB_TABLE_NAME: fixture.table,
      DYNAMO_REGION: "us-east-1", NEXTAUTH_URL: base, NEXTAUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", ADMIN_EMAIL: "owner@example.test",
    }, stdio: ["ignore", "pipe", "pipe"],
  })
  let log = ""
  child.stdout.on("data", chunk => { log += chunk })
  child.stderr.on("data", chunk => { log += chunk })
  try {
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error(`Synthetic app exited: ${log}`)
      try { ready = (await fetch(base + "/api/health")).ok } catch {
        // Connection refusal is expected while the synthetic server starts.
      }
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, "synthetic app starts")
    const token = await encode({ token: { sub: "synthetic-owner", email: "owner@example.test", name: "Synthetic owner" }, secret })
    const owner = { cookie: `next-auth.session-token=${token}` }
    const foreignToken = await encode({ token: { sub: "foreign", email: "foreign@example.test" }, secret })
    assert.equal((await fetch(base + "/api/social", { headers: { cookie: `next-auth.session-token=${foreignToken}` } })).status, 401)
    const notOwner = await fetch(base + "/admin", { headers: { cookie: `next-auth.session-token=${foreignToken}` }, redirect: "manual" })
    assert.ok([302, 307].includes(notOwner.status))
    for (const headers of [{}, owner]) {
      for (const slug of ["synthetic-draft", "unknown-slug"]) {
        const response = await fetch(base + `/api/posts/${slug}`, { headers })
        assert.equal(response.status, 404)
        assert.equal(response.headers.get("cache-control"), "no-store")
        assert.deepEqual(await response.json(), { error: "Not found" })
      }
      const response = await fetch(base + "/api/posts/synthetic-note", { headers })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("cache-control"), "no-store")
      assert.equal((await response.json()).body, "Synthetic public note body")
    }
    for (const method of ["PUT", "DELETE"]) {
      const response = await fetch(base + "/api/posts/synthetic-note", { method })
      assert.equal(response.status, 401)
    }
    assert.equal((await fetch(base + "/api/posts", { method: "POST" })).status, 401)
    const mutationHeaders = { ...owner, origin: base, "content-type": "application/json", "Idempotency-Key": require("node:crypto").randomUUID() }
    const payload = { title: "Synthetic new draft", body: "SYNTHETIC_NEW_BODY", type: "note", published: false,
      publishedAt: "2026-01-01T12:00:00.000Z", bskyText: "", bskyLinkTarget: "post" }
    for (const [method, path] of [["POST", "/api/posts"], ["PUT", "/api/posts/synthetic-draft"], ["DELETE", "/api/posts/synthetic-draft"]]) {
      for (const origin of [undefined, "https://evil.example.test"]) {
        const headers = { ...owner, "content-type": "application/json", ...(origin ? { origin } : {}) }
        const response = await fetch(base + path, { method, headers, ...(method !== "DELETE" ? { body: JSON.stringify(payload) } : {}) })
        assert.equal(response.status, 403)
      }
    }
    for (const [body, status] of [["{invalid", 400], [JSON.stringify({ ...payload, published: "true" }), 400],
      [JSON.stringify({ ...payload, body: "x".repeat(256 * 1024) }), 413]]) {
      const response = await fetch(base + "/api/posts", { method: "POST", headers: mutationHeaders, body })
      assert.equal(response.status, status)
    }
    const created = await fetch(base + "/api/posts", { method: "POST", headers: mutationHeaders, body: JSON.stringify(payload) })
    assert.equal(created.status, 201)
    const createdPost = await created.json()
    const draftPath = `/api/posts/${createdPost.pk}`
    assert.equal((await fetch(base + draftPath)).status, 404)
    const edit = await fetch(base + draftPath, { method: "PUT", headers: { ...mutationHeaders, "If-Match": `"${createdPost.revision}"` },
      body: JSON.stringify({ ...payload, body: "SYNTHETIC_EDITED_BODY" }) })
    assert.equal(edit.status, 200)
    const editedPost = await edit.json()
    assert.equal(editedPost.body, "SYNTHETIC_EDITED_BODY")
    assert.equal(editedPost.revision, 2)
    const stale = await fetch(base + draftPath, { method: "PUT", headers: { ...mutationHeaders, "If-Match": '"1"' }, body: JSON.stringify(payload) })
    assert.equal(stale.status, 409)
    assert.equal((await fetch(base + draftPath, { method: "DELETE", headers: { ...mutationHeaders, "If-Match": '"2"' } })).status, 200)
    assert.equal((await fetch(base + draftPath)).status, 404)
    assert.equal((await fetch(base + "/api/social")).status, 401)
    assert.equal((await fetch(base + "/api/social/dispatch", { method: "POST" })).status, 401)
    const status = await fetch(base + "/api/social", { headers: owner })
    assert.equal(status.status, 200)
    assert.ok(!(await status.text()).includes("SYNTHETIC_NEW_BODY"))
    const processQueue = await fetch(base + "/api/social", { method: "POST", headers: { ...owner, origin: base } })
    assert.equal(processQueue.status, 200)
    const anonymousAdmin = await fetch(base + "/admin", { redirect: "manual" })
    assert.ok([302, 307].includes(anonymousAdmin.status))
    const admin = await fetch(base + "/admin", { headers: owner })
    assert.equal(admin.status, 200)
    assert.ok((await admin.text()).includes("NEVER_PUBLIC_SYNTHETIC_BODY"), "owner still edits drafts in admin")
    for (const type of ["note", "essay", "project", "link"]) {
      for (const suffix of ["", `/synthetic-${type}`]) {
        const response = await fetch(base + `/${type}s${suffix}`)
        assert.equal(response.status, 200)
        assert.ok(!(await response.text()).includes("NEVER_PUBLIC_SYNTHETIC_BODY"))
      }
    }
    posts[0].published = false
    await fixture.db.send(new PutCommand({ TableName: fixture.table, Item: posts[0] }))
    assert.equal((await fetch(base + "/api/posts/synthetic-note")).status, 404)
    const list = await fetch(base + "/api/posts")
    assert.equal(list.headers.get("cache-control"), "no-store")
    assert.ok((await list.json()).every(post => post.pk !== "synthetic-note" && post.pk !== "synthetic-draft"))
    console.log("PASS: production build, anonymous/owner/draft/unknown/public access, mutation auth/origin/body limits, draft create/edit/delete, immediate unpublish, cache headers, 8 page routes; synthetic loopback database only")
  } finally {
    if (child.exitCode === null) {
      const stopped = once(child, "exit")
      child.kill("SIGTERM")
      await stopped
    }
    await fixture.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
