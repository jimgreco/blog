# Blog — Gemini Guide

## Deployment (AWS Amplify)
The blog remains on **AWS Amplify** as its resource usage is extremely low and cost is negligible ($0.01/mo).

### Stack
- **Next.js 14** (App Router)
- **DynamoDB** (AWS managed)
- **AWS Amplify Hosting** (Server-side rendering)

### CI/CD
Pushes to the `main` branch automatically trigger an Amplify build.
- **Build Spec**: `amplify.yml` (Node 20).

## Infrastructure Notes
- **DNS**: Cloudflare (proxied) → Amplify CNAME.
- **Database**: Uses the `BlogPosts` DynamoDB table in `us-east-1`.
- **Auth**: NextAuth v4 restricted to `ADMIN_EMAIL`.

## Required Env Vars (Amplify Console)
- `GOOGLE_CLIENT_ID / SECRET`
- `NEXTAUTH_SECRET`
- `ADMIN_EMAIL`
- `DYNAMODB_TABLE_NAME`
- `AWS_REGION`
