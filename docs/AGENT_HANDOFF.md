# Blog — coding handoff

Snapshot: **2026-11-02 UTC**. This is a takeover map, not release authorization. Recheck Git status, the requested scope and current runtime before acting. Existing AGENTS.md and linked contract/runbooks remain applicable. Older dated status notes are evidence from their stated date, not current permissions.

## Purpose and architecture

Personal publishing site with owner editing and optional social delivery.

Next15.5.27/React18.3.1, NextAuth4.24.15 and DynamoDB, hosted by Amplify. Revision-checked saves and transactional outbox/control items provide durable social-delivery intent.

## Locations and current work

- Usual local workspace: `/Users/jgreco/code/blog`.
- Source inspected for this handoff: `/Users/jgreco/Documents/Codex/2026-10-07/task/blog`.
- Existing repository: [jimgreco/blog](https://github.com/jimgreco/blog); default branch `main`, verified source head `5254031bacf3fec30491af844a97853b9a084662`.
- Documentation branch: `docs/agent-handoff-2026-11-02`, based on that head; application code was not changed.
- Primary checkout is at `d80ec6ac8499f6c939db17df784a6786e701e52e` on `main` and differs from remote main. Do not reset it or assume it contains released features; use the inspected source or a new isolated checkout.
- Pre-existing changes in the primary checkout are preserved. Inspect its status/diff before editing; the documentation branch excludes those changes.

## Code and guide map

- [app](../app)
- [app/admin/AdminClient.tsx](../app/admin/AdminClient.tsx)
- [app/api](../app/api)
- [lib/auth.ts](../lib/auth.ts)
- [lib/dynamo.ts](../lib/dynamo.ts)
- [tests](../tests)
- [amplify.yml](../amplify.yml)

Read the relevant existing guide before changing its contract:

- [docs/MAINTENANCE-2026-10-03.md](MAINTENANCE-2026-10-03.md)
- [docs/RELEASE-2026-10-07.md](RELEASE-2026-10-07.md)
- [CLAUDE.md](../CLAUDE.md)

## Local setup and dependencies

Commands below are source-verified entry points, **not commands executed during this documentation pass**. Use disposable local data. Read the command comments and linked setup guide before running migrations, creating fixtures or starting listeners. Reuse prepared environments where suitable.

- `Use pinned Node22.23.3/npm10.9.9 from package.json.`
- `npm ci`
- `Use the synthetic environment in docs/MAINTENANCE-2026-10-03.md and an isolated DynamoDB Local table.`
- `npm run dev`

Configuration names/locations only; never copy secret values into source, terminal output or handoff documents:

- `DYNAMODB_TABLE_NAME`
- `DYNAMO_REGION`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `BLUESKY_IDENTIFIER`
- `BLUESKY_PASSWORD`
- `MASTODON_INSTANCE_URL`
- `MASTODON_ACCESS_TOKEN`
- `SOCIAL_DISPATCH_SECRET`
- `BLOG_TEST_DYNAMODB_ENDPOINT`

Use existing lockfiles/manifests; do not upgrade dependencies to perform a handoff. For native work, select an actually installed Xcode SDK/simulator from the checked-in project configuration.

## Tests and verification

- `npm run lint`
- `npm test`
- `npx --no-install tsc --noEmit`
- `npm run test:integration  # BLOG_TEST_DYNAMODB_ENDPOINT must be isolated loopback`
- `npm run build`
- `npm run test:production  # same synthetic-only boundary`

Documentation-only changes require path/link, accuracy, diff and secret-exclusion review; do not run heavyweight builds or production smoke mutations for prose changes. Application tests were not rerun in this pass. Past test/release evidence below retains its original date. UI changes still require actual rendered inspection, and synthetic tests do not prove real provider/device acceptance.

## Decisions and constraints

- Never roll back to a reader that treats every DynamoDB item as a post after outbox/control records exist.
- An ambiguous provider send must retain its operation/idempotency identity; do not blindly clear, resend or delete it.
- Next16 migration55c21c1 is a separate local branch; do not silently combine it with the current Next15 reliability release.

## Release state and workflow effects

Amplify main auto-builds. November 2 read-only settings confirm auto branch creation disabled and only main registered, so the documentation branch does not deploy. No GitHub Actions workflows.

No exact-head GitHub run was present in the bounded recent-main query. This is not proof of deployment, build success or absence of older runs.

The handoff is published on a documentation feature branch, not main. Current checked-in GitHub push triggers are main-only (or absent). Blog hosting branch settings were separately checked. No native release, image publication or server deployment is intended from this documentation push.

## Known gaps and next safe work

- Current main5254031 has Amplify job35 SUCCEED, confirmed November 2. Browser/live provider acceptance and scheduler state were not re-tested.
- Existing primary untracked Dockerfile and .dockerignore are preserved. Historical dev-dependency advisory is dated evidence; rerun a scoped audit only when changing dependencies.

Before the next task, verify source HEAD, dirty/staged work and the selected subsystem; read only the relevant guide. Check whether a listed idea is already implemented in another branch before rebuilding it. Preserve unrelated work and paused experiments. Release/permission/data changes require the applicable current authorization.
