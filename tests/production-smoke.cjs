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
  const marshal = item => Object.fromEntries(Object.entries(item).map(([key, value]) =>
    [key, typeof value === "boolean" ? { BOOL: value } : { S: value }]))
  const unmarshal = item => Object.fromEntries(Object.entries(item).map(([key, value]) =>
    [key, value.S ?? value.BOOL ?? null]))
  let dbCalls = 0
  const db = createServer(async (req, res) => {
    let body = ""
    for await (const chunk of req) body += chunk
    const input = JSON.parse(body)
    const target = req.headers["x-amz-target"] || ""
    let output
    dbCalls++
    if (target.endsWith(".GetItem")) {
      const post = posts.find(item => item.pk === input.Key.pk.S)
      output = post ? { Item: marshal(post) } : {}
    } else if (target.endsWith(".Scan")) {
      let result = posts
      if (input.FilterExpression?.includes("published")) result = result.filter(post => post.published)
      const type = input.ExpressionAttributeValues?.[":type"]?.S
      if (type) result = result.filter(post => post.type === type)
      output = { Items: result.map(marshal) }
    } else if (target.endsWith(".PutItem")) {
      posts.push(unmarshal(input.Item))
      output = {}
    } else if (target.endsWith(".UpdateItem")) {
      const post = posts.find(item => item.pk === input.Key.pk.S)
      const values = unmarshal(input.ExpressionAttributeValues)
      for (const [alias, name] of Object.entries(input.ExpressionAttributeNames)) {
        post[name] = values[alias.replace("#k", ":v")]
      }
      output = {}
    } else if (target.endsWith(".DeleteItem")) {
      const index = posts.findIndex(item => item.pk === input.Key.pk.S)
      if (index >= 0) posts.splice(index, 1)
      output = {}
    } else {
      res.writeHead(400)
      res.end("Unexpected operation on synthetic fixture")
      return
    }
    res.writeHead(200, { "content-type": "application/x-amz-json-1.0" })
    res.end(JSON.stringify(output))
  })
  await new Promise(resolve => db.listen(0, "127.0.0.1", resolve))
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: {
      PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      AWS_EC2_METADATA_DISABLED: "true", AWS_ACCESS_KEY_ID: "synthetic", AWS_SECRET_ACCESS_KEY: "synthetic",
      DYNAMODB_ENDPOINT: `http://127.0.0.1:${db.address().port}`, DYNAMODB_TABLE_NAME: "SyntheticPosts",
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
    const mutationHeaders = { ...owner, origin: "http://127.0.0.1:3107", "content-type": "application/json" }
    const payload = { title: "Synthetic new draft", body: "SYNTHETIC_NEW_BODY", type: "note", published: false,
      publishedAt: "2026-01-01T12:00:00.000Z", bskyText: "", bskyLinkTarget: "post" }
    for (const [method, path] of [["POST", "/api/posts"], ["PUT", "/api/posts/synthetic-draft"], ["DELETE", "/api/posts/synthetic-draft"]]) {
      for (const origin of [undefined, "https://evil.example.test"]) {
        const before = dbCalls
        const headers = { ...owner, "content-type": "application/json", ...(origin ? { origin } : {}) }
        const response = await fetch(base + path, { method, headers, ...(method !== "DELETE" ? { body: JSON.stringify(payload) } : {}) })
        assert.equal(response.status, 403)
        assert.equal(dbCalls, before, "rejected origins never reach persistence")
      }
    }
    for (const [body, status] of [["{invalid", 400], [JSON.stringify({ ...payload, published: "true" }), 400],
      [JSON.stringify({ ...payload, body: "x".repeat(256 * 1024) }), 413]]) {
      const before = dbCalls
      const response = await fetch(base + "/api/posts", { method: "POST", headers: mutationHeaders, body })
      assert.equal(response.status, status)
      assert.equal(dbCalls, before)
    }
    const created = await fetch(base + "/api/posts", { method: "POST", headers: mutationHeaders, body: JSON.stringify(payload) })
    assert.equal(created.status, 201)
    const createdPost = await created.json()
    const draftPath = `/api/posts/${createdPost.pk}`
    assert.equal((await fetch(base + draftPath)).status, 404)
    const edit = await fetch(base + draftPath, { method: "PUT", headers: mutationHeaders,
      body: JSON.stringify({ ...payload, body: "SYNTHETIC_EDITED_BODY" }) })
    assert.equal(edit.status, 200)
    assert.equal(posts.find(item => item.pk === createdPost.pk).body, "SYNTHETIC_EDITED_BODY")
    assert.equal((await fetch(base + draftPath, { method: "DELETE", headers: mutationHeaders })).status, 200)
    assert.ok(!posts.some(item => item.pk === createdPost.pk))
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
    assert.equal((await fetch(base + "/api/posts/synthetic-note")).status, 404)
    const list = await fetch(base + "/api/posts")
    assert.equal(list.headers.get("cache-control"), "no-store")
    assert.ok((await list.json()).every(post => post.pk !== "synthetic-note" && post.pk !== "synthetic-draft"))
    assert.ok(dbCalls > 0)
    console.log("PASS: production build, anonymous/owner/draft/unknown/public access, mutation auth/origin/body limits, draft create/edit/delete, immediate unpublish, cache headers, 8 page routes; synthetic loopback database only")
  } finally {
    if (child.exitCode === null) {
      const stopped = once(child, "exit")
      child.kill("SIGTERM")
      await stopped
    }
    await new Promise(resolve => db.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
