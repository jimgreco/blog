/** @type {import('next').NextConfig} */
const nextConfig = {
  // Amplify WEB_COMPUTE doesn't inject env vars into the Lambda runtime.
  // The build container does have them (from Amplify console + SSM).
  // We embed them here so they're available in the server bundle at runtime.
  // All of these are server-only variables — none appear in client components,
  // so they are NOT included in client-side JS bundles.
  env: {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME,
    DYNAMO_REGION: process.env.DYNAMO_REGION,
  },
}

module.exports = nextConfig
