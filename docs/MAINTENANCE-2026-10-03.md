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
of an unused helper, and unambiguous test-module names. That initial change was type cleanup; the later request-validation work is
documented below. Equivalent regex escaping in Mastodon was simplified
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
- The former `nvm use 20` build selection is now replaced **locally** with exact
  Node **22.23.3** and bundled npm **10.9.9**, as detailed below. Read-only Amplify
  `get-app` returned a null build-spec override, so the repository `amplify.yml`
  is the applicable specification. The canonical www redirect points to
  `https://jim-greco.com`. No live settings or build jobs were changed.
- No push, Amplify build trigger, deployment, real Google login or social posting
  was performed. Authorized publication still needs exact remote-SHA/build-job
  verification and safe public health/privacy smoke. Full provider acceptance
  needs a separately approved real-account test.
- Next 15 remains Maintenance LTS. Its documented two-year window from
  October 21, 2024 reaches October 21, 2026; plan Next 16 separately using the
  [official support policy](https://nextjs.org/support-policy). Mutation-origin and body validation are now implemented locally below.
  Revision/outbox and runtime-secret work remain separate changes.

## Supported build runtime and bounded mutations — follow-up

`.nvmrc` selects **22.23.3**; package engines require that Node version and
**npm 10.9.9**, with `packageManager` documenting the npm pin. `amplify.yml`
installs/selects `.nvmrc`, prints versions, runs `npm ci --engine-strict --no-audit
--no-fund`, then lint and all synthetic unit regressions before the existing
production build. These changes are local and committed for review only.

[Node's official release index](https://nodejs.org/dist/index.json) identifies
22.23.3 as Jod LTS (2026-09-23), bundling npm 10.9.9. Both Darwin arm64 and Linux
x64 archives were downloaded from nodejs.org and matched against the release's
[official SHA-256 list](https://nodejs.org/dist/v22.23.3/SHASUMS256.txt).
The [Amplify SSR documentation](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-supported-features.html)
supports Node 22 and states that the SSR compute runtime uses the build's Node
**major** version. This establishes the supported major and local build target;
AWS controls its deployed runtime patch. No Node 24/Next 16 migration is included.

All three post mutations still authenticate first, then require the exact origin
of server-configured `NEXTAUTH_URL`. Missing/opaque/foreign/sibling origins return
403; invalid server configuration fails closed with 500. Host and forwarded-host
headers cannot define the allowlist. Release review must confirm the canonical
HTTPS URL is configured correctly; this task did not inspect secret values.
Browser requests from the existing editor automatically carry Origin.

POST/PUT accept only application/json, cap actual streamed UTF-8 bytes at
**262,144 (256 KiB)** even without/with an understated Content-Length, reject
malformed JSON/UTF-8, and validate the editor's existing complete payload before
any database or syndication call. Titles must be nonblank and at most 512 code
units; social text at most 10,000; optional HTTP(S) links at most 4,096 and without
embedded credentials. Post type, publication boolean, social link target and
real ISO UTC timestamp are checked; unknown fields are rejected. The body may be
empty within the total byte cap. Missing publication/social fields cannot silently
turn a partial edit into an unpublish/delete operation. Empty body/social text and
optional/empty links remain accepted. There is no new schema dependency.

Latest gates on **Node 22.23.3 / npm 10.9.9**, on both macOS arm64 and a disposable
Linux x64 container:

```sh
node --version
npm --version
npm ci --engine-strict --no-audit --no-fund  # Mac also used --offline
npm run lint
npm test                                 # 23 passed on each platform
npx --no-install tsc --noEmit
# Same synthetic build variables listed above; no real account/table/provider.
npm run build
npm run test:production
```

The Linux build used the checksum-verified official Node binary on the pinned
Python 3.12.15 Debian slim validation base; it is a compatibility test, not a
replacement Blog deployment container or a claim to reproduce Amplify's complete
build environment. Its smoke ran with external networking disabled, no host
mounts/ports, dropped capabilities and a read-only root. The synthetic loopback
DynamoDB fixture now verifies real HTTP draft create/edit/delete, origin rejection
on all mutations, malformed/oversized body rejection before persistence, and all
previous privacy/page checks. No provider messages are sent. Unit cases also cover
exact byte boundaries, chunk cancellation, multibyte input, malformed dates,
partial edits, forged fields and spoofed headers. Mac `npm ls --all` and whitespace
review passed. No dependency versions changed in this follow-up.

Evidence is in the enclosing maintenance workspace's `evidence/blog/node22/`
(`SHASUMS256.txt`, `production-mac.log`, `linux-build.log`, `linux-production.log`,
`npm-tree.txt`). Publication still requires explicit authorization: a main-branch
push can deploy automatically. Verify the final remote SHA, Amplify build/runtime
and safe public smoke after an authorized release; real account/provider testing
remains separately gated. The local Node 20 compatibility gap is resolved, but
no live Amplify build has been asserted.
