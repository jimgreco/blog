const fs = require("node:fs")
// Use Amplify's server runtime file, never next.config.env/client substitution.
const names = ["NEXTAUTH_URL", "NEXTAUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ADMIN_EMAIL",
  "DYNAMODB_TABLE_NAME", "DYNAMO_REGION", "BLUESKY_IDENTIFIER", "BLUESKY_PASSWORD",
  "MASTODON_INSTANCE_URL", "MASTODON_ACCESS_TOKEN", "SOCIAL_DISPATCH_SECRET"]
function serialize(env) {
  return names.filter(name => env[name] !== undefined).map(name => {
    const value = env[name]
    // dotenv accepts multiline single/backtick quotes without changing escapes.
    // Escape dollars to prevent dotenv-expand from interpreting credential text.
    const quote = ["'", "`", '"'].find(mark => !value.includes(mark) && (mark !== '"' || !/\\[nr]/.test(value)))
    if (!quote || value.includes("\0")) throw new Error(`Cannot encode runtime variable ${name}; use a runtime secret store.`)
    return `${name}=${quote}${value.replace(/\$/g, "\\$")}${quote}`
  }).join("\n") + "\n"
}
if (require.main === module) fs.writeFileSync(".env.production", serialize(process.env), { mode: 0o600 })
module.exports = { serialize }
