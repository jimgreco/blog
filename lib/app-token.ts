import { OAuth2Client } from "google-auth-library"

// The iPhone app signs in with Google and sends its Google ID token as a
// bearer token. The token must be issued for one of our iOS OAuth clients and
// belong to the verified owner address. Nothing is stored server side.
const client = new OAuth2Client()
const MAX_TOKEN_LENGTH = 8192

export function bearerToken(req: Request): string | null {
  const match = (req.headers.get("authorization") || "").match(/^Bearer ([A-Za-z0-9._-]+)$/)
  return match && match[1].length <= MAX_TOKEN_LENGTH ? match[1] : null
}

export async function isOwnerToken(token: string): Promise<boolean> {
  const audience = (process.env.GOOGLE_IOS_CLIENT_ID || "").split(",").map(id => id.trim()).filter(Boolean)
  const owner = process.env.ADMIN_EMAIL
  if (!audience.length || !owner) return false
  try {
    const payload = (await client.verifyIdToken({ idToken: token, audience })).getPayload()
    return Boolean(payload?.email_verified && payload.email === owner)
  } catch {
    return false
  }
}
