# Local maintenance verification — 2026-10-03

Based on freshly verified GitHub main `e379be2f88fc13b813e23c2d60bfa2bc33227095`
in a new isolated clone. The original Blog checkout was not modified.

`npm run lint` now runs the standalone ESLint CLI without an interactive setup
prompt. The flat config enables Next Core Web Vitals and TypeScript rules, includes
the synthetic tests, and fails on warnings. Generated files are ignored; CommonJS
imports remain allowed only in the CommonJS test/config files. The config follows
[Next 15's documented adapter](https://nextjs.org/docs/15/app/api-reference/config/eslint).

The lint findings were resolved with SDK record/blob types, an explicit nullable
syndication-update type, safe narrowing of the previous post's timestamp, removal
of an unused helper, and unambiguous test-module names. This is type cleanup, not
request-schema validation. Existing production dependency versions are unchanged.

Saving a draft no longer prints its social text to the server log. A synthetic
regression verifies that content is still saved and is neither logged nor sent to
a social provider. Additional stubbed Bluesky edit tests cover timestamp/facet
preservation and fallback when the previous record is malformed or unavailable.

## Commands and results

Node 22.14.0 / npm 10.9.2:

```sh
npm install --save-dev --save-exact eslint@9.39.5 eslint-config-next@15.5.24 \
  @eslint/eslintrc@3.3.7 --no-audit --no-fund --registry=https://registry.npmjs.org
npm ci --offline --no-audit --no-fund
npm run lint
npm test
npx --no-install tsc --noEmit
env -i PATH="$PATH" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
  AWS_EC2_METADATA_DISABLED=true AWS_ACCESS_KEY_ID=synthetic \
  AWS_SECRET_ACCESS_KEY=synthetic DYNAMODB_ENDPOINT=http://127.0.0.1:9 \
  DYNAMODB_TABLE_NAME=SyntheticPosts DYNAMO_REGION=us-east-1 \
  NEXTAUTH_URL=http://127.0.0.1:3107 \
  NEXTAUTH_SECRET=synthetic-audit-session-key-not-for-production \
  GOOGLE_CLIENT_ID=synthetic-client GOOGLE_CLIENT_SECRET=synthetic-secret \
  ADMIN_EMAIL=owner@example.test npm run build
npm run test:production
git diff --check
```

Clean lockfile install, lint, typecheck, production build and all 15 synthetic
regression tests passed.
The production smoke passed anonymous/owner/draft/unknown/public access, mutation
authentication, immediate unpublish, cache headers, and eight page routes against
its temporary loopback fixture. No UI layout changed. Logs are retained outside
the checkout in the maintenance workspace's `evidence/blog/` directory.

## Remaining gates and limits

- No dependency inventory was submitted to an external audit service. Install
  used `--no-audit`; no new vulnerability-free claim is made.
- ESLint 9.39.5 is the compatible major accepted by the matching Next 15 config;
  npm marks it unsupported. Move the lint stack forward with the separately
  planned Next 16 migration instead of forcing incompatible peer dependencies.
- Push/deployment, hosted CI, Linux production-image checks, live Google login,
  and real social publishing were not performed. Publication requires separate
  authorization and the current hosting owner's release gates. Broader origin,
  schema, revision/outbox and runtime-secret work remains deferred.
