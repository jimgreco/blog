# Local maintenance verification — 2026-10-03

Based on freshly verified GitHub main `e379be2f88fc13b813e23c2d60bfa2bc33227095`
in a new isolated clone. The original Blog checkout was not modified.

`npm run lint` now runs supported **ESLint 10.12.0** without an interactive setup
prompt. Its flat config directly loads JavaScript recommended rules, TypeScript
recommended rules, Next Core Web Vitals, and the Rules of Hooks/dependency checks.
It includes the synthetic tests and fails on warnings. Generated files are
ignored; CommonJS imports are allowed only in the CommonJS test/config files.
This uses [Next's documented standalone plugin route](https://nextjs.org/docs/15/app/api-reference/config/eslint),
without a framework-major migration or forced peer dependencies.

The earlier local commit used ESLint 9.39.5. That version is **upstream EOL since
August 6, 2026**, according to the [official ESLint support table](https://eslint.org/version-support/).
It was accepted by Next 15's bundled config; "unsupported" referred to upstream
maintenance, not a Next incompatibility. That temporary choice is superseded:
ESLint 9 and `eslint-config-next`/FlatCompat were removed before publication.
`typescript-eslint` 8.71.0 and React Hooks 7.1.1 explicitly accept ESLint 10.
The older React/JSX-a11y/import plugin bundle is not retained because its React and
JSX-a11y peer ranges do not accept ESLint 10. The stated rule coverage is precise;
this is not a claim that all rules from that legacy bundle are enabled. Negative
synthetic probes verified active TypeScript, conditional-hook, Next image and
undefined-JavaScript-name diagnostics.

The lint findings were resolved with SDK record/blob types, an explicit nullable
syndication-update type, safe narrowing of the previous post's timestamp, removal
of an unused helper, and unambiguous test-module names. This is type cleanup, not
request-schema validation. Equivalent regex escaping in Mastodon was simplified
for the core JavaScript rules; a startup retry catch now explains its empty body.

Saving a draft no longer prints its social text to the server log. A synthetic
regression verifies that content is still saved and is neither logged nor sent to
a social provider. Additional stubbed Bluesky edit tests cover timestamp/facet
preservation and fallback when the previous record is malformed or unavailable.

## Exact dependency changes and advisory scope

- `next`, `@next/env` and the locked `@next/swc-*` binaries: **15.5.24 → 15.5.27**.
  The matching standalone Next lint plugin is **15.5.27**. This is a patch within
  Next 15; React remains **18.3.1**, NextAuth remains **4.24.15**.
- Lint-only pins: ESLint **10.12.0**, `@eslint/js` **10.0.1**,
  `typescript-eslint` **8.71.0**, `eslint-plugin-react-hooks` **7.1.1**,
  and `globals` **17.13.0**. ESLint requires Node **20.19+, 22.13+, or 24+**
  within its declared version ranges; local validation used Node **22.14.0**.
- The shared browser-compatibility data package `caniuse-lite` moved from
  **1.0.30001780 → 1.0.30001814** during resolution. No other production package
  versions changed. The existing PostCSS override is retained.

The [official Next 15.5.27 release](https://github.com/vercel/next.js/releases/tag/v15.5.27)
contains security fixes; 15.5.26 also adds `next/og` hardening. The cited cache
advisories require Pages Router SSG/ISR or a root catch-all route with static/ISR
content; Blog's content routes are App Router `force-dynamic`, with no such
catch-all or generated metadata-image routes. No exploit against this app is
claimed. Some public advisory version fields still contain placeholder patch
numbers, so the concrete upgrade target follows the official release tag.
No npm audit or private dependency-inventory disclosure was performed; this is
not a new claim that the entire dependency graph has zero advisories.

## Commands and results

Node 22.14.0 / npm 10.9.2:

```sh
npm install --no-audit --no-fund --registry=https://registry.npmjs.org
npm install --save-exact next@15.5.27 --no-audit --no-fund \
  --registry=https://registry.npmjs.org
npm install --save-dev --save-exact @next/eslint-plugin-next@15.5.27 \
  --no-audit --no-fund --registry=https://registry.npmjs.org
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
npm ls --all
```

Clean lockfile install, lint, typecheck, production build and all 15 synthetic
regression tests passed.
The production smoke passed anonymous/owner/draft/unknown/public access, mutation
authentication, immediate unpublish, cache headers, and eight page routes against
its temporary loopback fixture. No UI layout changed. Logs are retained outside
the checkout in the maintenance workspace's `evidence/blog/` directory.

## Release paths, remaining gates and useful follow-up

- No dependency inventory was submitted to an external audit service. Install
  used `--no-audit`; no new vulnerability-free claim is made.
- Fresh read-only Amplify queries confirmed app `d1k79dwq6c1dnq`, `WEB_COMPUTE`,
  repository `jimgreco/blog`, branch `main`, stage `PRODUCTION`, and **branch
  `enableAutoBuild=true`**. App-level `enableBranchAutoBuild=false` controls new
  branches and does not disable this existing branch. A push to main can deploy;
  publication must be treated as a production action. No GitHub workflows were
  returned for Blog. Remote main remains `e379be2f88fc13b813e23c2d60bfa2bc33227095`.
- Tracked `amplify.yml` runs `nvm use 20`, `npm ci`, then `npm run build`, publishing
  `.next`. It does not run the separate regression/production smoke scripts.
  The hosting owner must confirm the build Node version satisfies ESLint's engine
  floor and review moving the pipeline/runtime to supported Node 22. That release
  configuration was not changed here. No untracked Docker migration files were
  copied from the user's original checkout.
- No push, Amplify build trigger, deployment, real Google login or social posting
  was performed. Authorized publication still needs exact remote-SHA/build-job
  verification and safe public health/privacy smoke. Full provider acceptance
  needs a separately approved real-account test.
- Next 15 remains Maintenance LTS. Its documented two-year window from
  October 21, 2024 reaches October 21, 2026; plan Next 16 separately using the
  [official support policy](https://nextjs.org/support-policy). A high-value
  bounded app follow-up is explicit mutation-origin checks and strict input/body
  bounds with synthetic tests. Revision/outbox and runtime-secret work remain
  separate changes.
