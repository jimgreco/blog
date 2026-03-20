# Blog — Claude Context

## Stack
- **Next.js 14** (App Router), TypeScript
- **AWS Amplify** hosting (SSR) — app ID `d1k79dwq6c1dnq`
- **DynamoDB** — table `BlogPosts`, PK: `pk` (slug string)
- **NextAuth v4** with Google OAuth — access restricted to `ADMIN_EMAIL`
- **react-markdown** + remark-gfm for rendering
- Plain CSS, no Tailwind — dark Daring Fireball-inspired design

## Key files
| File | Purpose |
|------|---------|
| `lib/dynamo.ts` | DynamoDB CRUD. `Post` interface: `pk`, `title`, `body`, `publishedAt`, `published`, `type`, `link?` |
| `lib/auth.ts` | NextAuth config, `signIn` callback restricts to `ADMIN_EMAIL` |
| `lib/utils.ts` | `slugify()`, `formatDate()` |
| `app/admin/AdminClient.tsx` | Client-side editor with write/preview tabs |
| `middleware.ts` | Protects `/admin/*` via next-auth/middleware |
| `amplify.yml` | Build config (Node 20, `npm ci`, `next build`) |

## Post types
`PostType = "note" | "essay" | "project" | "link"`

Each type has its own route segment (`/notes`, `/essays`, `/projects`, `/links`). `link` posts have an optional `link` field for the external URL.

## Env vars
```
NEXTAUTH_URL=https://jim-greco.com
NEXTAUTH_SECRET=          # openssl rand -base64 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAIL=
DYNAMODB_TABLE_NAME=BlogPosts
AWS_REGION=us-east-1

# Local dev only (Amplify uses its IAM role in prod):
# DYNAMODB_ENDPOINT=http://localhost:8000
# DYNAMO_ACCESS_KEY_ID=
# DYNAMO_SECRET_ACCESS_KEY=
```

## Local development
```bash
npm install
npm run dev        # http://localhost:3000
```

For local DynamoDB, set `DYNAMODB_ENDPOINT=http://localhost:8000` and run DynamoDB Local.

## Deployment
Pushes to `main` auto-deploy via Amplify. No manual deploy step needed.

## Infrastructure notes
- **DNS**: Cloudflare (proxied, orange cloud) with a Worker that proxies `jim-greco.com/*` and `www.jim-greco.com/*` → `main.d1k79dwq6c1dnq.amplifyapp.com`. This bypasses CloudFront alias validation which doesn't work with Cloudflare CNAME flattening.
- **Auth callback URL**: `https://jim-greco.com/api/auth/callback/google` must be in Google Cloud Console → OAuth 2.0 Client authorized redirect URIs.
- **DynamoDB IAM**: Amplify service role needs `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Scan` on the BlogPosts table.
- **`type` is a DynamoDB reserved word** — always aliased via `ExpressionAttributeNames` in queries.
