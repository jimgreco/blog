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
  loopback-only DynamoDB fixture. Use the synthetic build environment documented
  in `docs/MAINTENANCE-2026-10-03.md`; never point tests at real posts/providers.
- Deployment configuration: `amplify.yml` and the sibling `../deploy/` project.
  Confirm the active hosting route before shipping; historical notes are not
  proof of current production state.
