const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { serialize } = require("../scripts/write-runtime-env.cjs")
test("server runtime variables preserve literal credentials without expansion or client exposure", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "blog-runtime-env-"))
  try {
    const env = { NEXTAUTH_SECRET: "SYNTHETIC_${HOME}_$token_\\path", GOOGLE_CLIENT_SECRET: "SYNTHETIC_'quoted'\nsecond line",
      BLUESKY_PASSWORD: 'SYNTHETIC_"double"_`backtick`', ADMIN_EMAIL: "owner@example.test", UNRELATED_SECRET: "never-export" }
    const content = serialize(env)
    assert.ok(!content.includes("UNRELATED_SECRET"))
    fs.writeFileSync(path.join(directory, ".env.production"), content)
    const result = spawnSync(process.execPath, ["-e", `const {loadEnvConfig}=require('@next/env');const result=loadEnvConfig(${JSON.stringify(directory)},false);process.stdout.write(JSON.stringify(result.parsedEnv));`],
      { cwd: path.resolve(__dirname, ".."), env: { NODE_ENV: "production" }, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    const parsed = JSON.parse(result.stdout)
    for (const key of Object.keys(env).filter(key => key !== "UNRELATED_SECRET")) assert.equal(parsed[key], env[key])
    assert.throws(() => serialize({ NEXTAUTH_SECRET: "'\"`" }), /Cannot encode runtime variable NEXTAUTH_SECRET/)
    const config = require("../next.config.js")
    assert.deepEqual(Object.keys(config.env), ["APP_BUILD_SHA"])
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
