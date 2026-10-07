/** @type {import('next').NextConfig} */
module.exports = {
  experimental: { cpus: 1 },
  env: { APP_BUILD_SHA: process.env.AWS_COMMIT_ID || process.env.APP_BUILD_SHA || "unknown" },
}
