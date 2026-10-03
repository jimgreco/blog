const assert = require("node:assert/strict")
const test = require("node:test")
const { EventEmitter } = require("node:events")
const { PassThrough } = require("node:stream")
const load = require("./load-typescript.cjs")

function harness({ addresses = [{ address: "93.184.215.14", family: 4 }], responses = [] } = {}) {
  const calls = []
  const request = (url, options, callback) => {
    calls.push({ url: url.href, options })
    const req = new EventEmitter()
    req.end = () => {
      const next = responses.shift()
      if (!next) throw new Error("Unexpected HTTP request")
      const res = new PassThrough()
      res.statusCode = next.status || 200
      res.headers = next.headers || { "content-type": "text/html" }
      queueMicrotask(() => {
        callback(res)
        for (const chunk of next.chunks || ["<title>Public</title>"]) {
          if (!res.destroyed) res.write(chunk)
        }
        if (!res.destroyed) res.end()
      })
    }
    return req
  }
  const api = load("lib/public-fetch.ts", {
    "node:dns/promises": { lookup: async () => addresses },
    "node:http": { request }, "node:https": { request },
  })
  return { ...api, calls }
}

test("preview rejects local, metadata, encoded, mapped, tunnel and reserved IPs before connecting", async () => {
  const api = harness()
  for (const host of ["localhost", "127.0.0.1", "2130706433", "0x7f000001", "10.0.0.1",
    "169.254.169.254", "192.168.1.1", "192.88.99.1", "100.64.0.1", "[::1]", "[::ffff:127.0.0.1]",
    "[64:ff9b::a00:1]", "[2002:7f00:1::]", "[fc00::1]", "[2001:db8::1]"]) {
    const current = host === "localhost" ? harness({ addresses: [{ address: "127.0.0.1", family: 4 }] }) : api
    await assert.rejects(current.fetchPublicPreview(`http://${host}/`, 100, ["text/html"]))
    assert.equal(current.calls.length, 0)
  }
})

test("preview rejects mixed public/private DNS answers, credentials, schemes and unusual ports", async () => {
  const api = harness({ addresses: [{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.1", family: 4 }] })
  for (const url of ["https://mixed.example/", "file:///etc/passwd", "ftp://example.com/",
    "https://user:password@example.com/", "https://example.com:8000/"]) {
    await assert.rejects(api.fetchPublicPreview(url, 100, ["text/html"]))
  }
  assert.equal(api.calls.length, 0)
})

test("preview times out a stalled DNS lookup without connecting", async () => {
  let requests = 0
  const api = load("lib/public-fetch.ts", {
    "node:dns/promises": { lookup: () => new Promise(() => {}) },
    "node:http": { request: () => { requests++ } },
    "node:https": { request: () => { requests++ } },
  }, { setTimeout: (callback) => setTimeout(callback, 10) })
  await assert.rejects(api.fetchPublicPreview("https://public.example/", 100, ["text/html"]), /timed out/)
  assert.equal(requests, 0)
})

test("preview total deadline aborts a stalled connection", async () => {
  let signal
  const request = (_url, options) => {
    signal = options.signal
    const req = new EventEmitter()
    req.end = () => {}
    return req
  }
  const api = load("lib/public-fetch.ts", {
    "node:dns/promises": { lookup: async () => [{ address: "93.184.215.14", family: 4 }] },
    "node:http": { request }, "node:https": { request },
  }, { setTimeout: (callback) => setTimeout(callback, 10) })
  await assert.rejects(api.fetchPublicPreview("https://public.example/", 100, ["text/html"]), /timed out/)
  assert.equal(signal.aborted, true)
  assert.equal(api.isPublicAddress("2606:4700::1111"), true)
})

test("preview pins the vetted DNS address while retaining original TLS/Host hostname", async () => {
  const api = harness({ responses: [{}] })
  const result = await api.fetchPublicPreview("https://public.example/page", 100, ["text/html"])
  assert.equal(result.body.toString(), "<title>Public</title>")
  assert.equal(api.calls[0].url, "https://public.example/page")
  assert.equal(api.calls[0].options.agent, false)
  api.calls[0].options.lookup("public.example", {}, (error, address, family) => {
    assert.equal(error, null)
    assert.equal(address, "93.184.215.14")
    assert.equal(family, 4)
  })
  api.calls[0].options.lookup("public.example", { all: true }, (error, addresses) => {
    assert.equal(error, null)
    assert.equal(addresses[0].address, "93.184.215.14")
  })
})

test("every redirect is revalidated and a redirect to metadata never connects", async () => {
  const api = harness({ responses: [{ status: 302, headers: { location: "http://169.254.169.254/latest/" } }] })
  await assert.rejects(api.fetchPublicPreview("https://public.example/", 100, ["text/html"]), /non-public/)
  assert.equal(api.calls.length, 1)
})

test("valid relative redirects work and redirect loops have a bound", async () => {
  const api = harness({ responses: [{ status: 302, headers: { location: "/next" } }, {}] })
  assert.equal((await api.fetchPublicPreview("https://public.example/", 100, ["text/html"])).url,
    "https://public.example/next")
  const loop = harness({ responses: Array.from({ length: 4 }, () => ({ status: 302, headers: { location: "/next" } })) })
  await assert.rejects(loop.fetchPublicPreview("https://public.example/", 100, ["text/html"]), /Too many/)
  assert.equal(loop.calls.length, 4)
})

test("preview bounds streamed bytes and rejects mismatched MIME or compressed responses", async () => {
  for (const response of [
    { chunks: ["123456", "789012"] },
    { headers: { "content-type": "text/html", "content-length": "1000" } },
    { headers: { "content-type": "application/json" } },
    { headers: { "content-type": "text/html", "content-encoding": "gzip" } },
  ]) {
    const api = harness({ responses: [response] })
    await assert.rejects(api.fetchPublicPreview("https://public.example/", 10, ["text/html"]))
  }
})

test("remote HTML cannot turn a social preview into a private-network image fetch/upload", async () => {
  const api = harness({ responses: [{ chunks: [
    '<title>Public page</title><meta property="og:image" content="http://169.254.169.254/private">',
  ] }] })
  let uploads = 0
  let posted
  class Agent {
    async login() {}
    async uploadBlob() { uploads++; throw new Error("No upload expected") }
    async post(record) { posted = record; return { uri: "synthetic", cid: "synthetic" } }
  }
  class RichText { constructor(text) { this.text = text.text } async detectFacets() {} }
  const fs = require("node:fs")
  const vm = require("node:vm")
  const ts = require("typescript")
  const code = ts.transpileModule(fs.readFileSync(require("node:path").join(__dirname, "../lib/bluesky.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, URL, Uint8Array,
    console: { log() {}, error() {} },
    process: { env: { BLUESKY_IDENTIFIER: "synthetic", BLUESKY_PASSWORD: "synthetic" } },
    require: (name) => name === "@atproto/api" ? { BskyAgent: Agent, RichText } : api,
  })
  await module.exports.postToBluesky("Synthetic", "https://public.example/")
  assert.equal(api.calls.length, 1)
  assert.equal(uploads, 0)
  assert.equal(posted.embed.external.title, "Public page")
  assert.equal(posted.embed.external.thumb, undefined)
})
