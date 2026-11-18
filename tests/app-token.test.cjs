const assert = require("node:assert/strict")
const test = require("node:test")
const load = require("./load-typescript.cjs")

const OWNER = "owner@example.test"
const IOS = "synthetic-ios.apps.googleusercontent.com"
// Synthetic Google verifier: tokens are "good", "unverified", "other" or anything else (invalid).
function fixture(env = { GOOGLE_IOS_CLIENT_ID: IOS, ADMIN_EMAIL: OWNER }, sessionEmail = null) {
  const audiences = []
  const google = { OAuth2Client: class { async verifyIdToken({ idToken, audience }) {
    audiences.push(audience)
    const payload = { good: { email: OWNER, email_verified: true }, unverified: { email: OWNER, email_verified: false },
      other: { email: "someone@example.test", email_verified: true } }[idToken]
    if (!payload) throw new Error("invalid token")
    return { getPayload: () => payload }
  } } }
  const globals = { process: { env } }
  const appToken = load("lib/app-token.ts", { "google-auth-library": google }, globals)
  const guard = load("lib/mutation-guard.ts", {
    "next-auth": { getServerSession: async () => sessionEmail ? { user: { email: sessionEmail } } : null },
    "@aws-sdk/lib-dynamodb": {}, "./auth": {}, "./dynamo": {}, "./post-store": {}, "./app-token": appToken,
  }, globals)
  return { appToken, guard, audiences }
}
const req = auth => new Request("https://blog.example.test/api/posts", { headers: auth === undefined ? {} : { authorization: auth } })

test("only a verified owner Google token for the iOS client authorizes the app", async () => {
  const { guard, audiences } = fixture()
  assert.equal(await guard.authorize(req("Bearer good")), "app")
  for (const auth of ["Bearer unverified", "Bearer other", "Bearer bogus", "Bearer ", "Basic good", "good", "Bearer a b", "Bearer " + "a".repeat(8193)]) {
    assert.equal(await guard.authorize(req(auth)), null, auth)
  }
  assert.ok(audiences.every(audience => JSON.stringify(audience) === JSON.stringify([IOS])))
})

test("an Authorization header never falls back to the browser session", async () => {
  const { guard } = fixture(undefined, OWNER)
  assert.equal(await guard.authorize(req()), "browser")
  assert.equal(await guard.authorize(req("Bearer bogus")), null)
})

test("app tokens are refused until the iOS client id and owner are configured", async () => {
  for (const env of [{ ADMIN_EMAIL: OWNER }, { GOOGLE_IOS_CLIENT_ID: IOS }, { GOOGLE_IOS_CLIENT_ID: " , ", ADMIN_EMAIL: OWNER }]) {
    const { guard, audiences } = fixture(env)
    assert.equal(await guard.authorize(req("Bearer good")), null)
    assert.equal(audiences.length, 0)
  }
})
