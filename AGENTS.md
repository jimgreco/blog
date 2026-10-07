# Blog — Codex Guide

## Efficient Start

- Use supplied context once. Before code edits, inspect `git status --short --branch`,
  `git diff --stat`, and `git diff --cached --stat`, then relevant hunks. Preserve
  unrelated work and stage only the requested scope when committing.
- Start with the paths below and narrow `rg` searches. Batch independent reads;
  reuse installed dependencies and build caches unless a change invalidates them.
- Make routine reversible decisions and complete the authorized outcome. Avoid
  speculative cleanup, repeated permission questions, and unrelated work.
- Run meaningful checks for the changed surface once after edits settle, including
  the repository's required gates. Repeat only when new evidence invalidates them.
  Documentation-only edits need diff, link/path, and whitespace review.
- For requested releases, follow the current workflow and verify the final pushed
  SHA and applicable live results. Keep build, deployment, TestFlight upload, and
  physical-device evidence distinct. Report the outcome and actual verification.

## Local Pointers

- Pages and styling: `app/`, `app/globals.css`; editor: `app/admin/AdminClient.tsx`.
- API/auth/storage: `app/api/`, `lib/auth.ts`, `lib/dynamo.ts`, `middleware.ts`.
- Existing architecture notes: `CLAUDE.md`; read the relevant section for the task.
- Check scripts in `package.json`: `npm run lint` and `npm run build` for code
  changes, plus `npm test` for synthetic regressions; inspect the affected page
  for UI changes. `npm run test:production` exercises a production build with a
  loopback-only DynamoDB Local fixture (set `BLOG_TEST_DYNAMODB_ENDPOINT` to
  an isolated port); `npm run test:integration` tests real transaction behavior. Use the synthetic build environment documented
  in `docs/MAINTENANCE-2026-10-03.md`; never point tests at real posts/providers.
- Deployment configuration: `amplify.yml` and the sibling `../deploy/` project.
  Confirm the active hosting route before shipping; historical notes are not
  proof of current production state.

## October 2026 reliability release

- Read `docs/RELEASE-2026-10-07.md` before release, rollback, or social recovery.
- New saves use revisions and transactional outbox/control records. Never roll
  back to a reader that treats every table item as a post.
- All tests must use synthetic accounts/providers and unique local tables.
