# Quick Post (iPhone)

A small SwiftUI app for posting to jim-greco.com from an iPhone. It opens straight
to a composer: pick a type, type, tap **Publish**.

- Notes don't need a title; the first line of the body is used.
- Link posts have a paste button for the URL on your clipboard.
- Optional Bluesky/Mastodon text (300-character counter) and link target, like the web editor.
- Save as a draft instead of publishing.
- **Posts** (the ⋯ menu) lists posts and drafts; tap one to edit, swipe to delete.
- The draft is kept on the phone until the blog confirms the save, and a retried
  new post reuses the same idempotency key, so a flaky connection can't duplicate it.

## How it authenticates

The app signs in with Google and sends the Google ID token as
`Authorization: Bearer <token>` to the blog's existing `/api/posts` and
`/api/social` routes. The blog (`lib/app-token.ts`) verifies the token against
Google, requires its audience to be the iOS client id in `GOOGLE_IOS_CLIENT_ID`,
and requires a verified email equal to `ADMIN_EMAIL`. No new secret or session
table is stored on the server. Google Sign-In keeps and refreshes the token on the phone.

## One-time setup

1. **Google Cloud Console** → APIs & Services → Credentials, in the same project
   as the blog's web client: *Create credentials → OAuth client ID → iOS*,
   bundle ID `com.jimgreco.quickpost`. Note the client ID and its reversed form
   (`com.googleusercontent.apps.…`).
2. **Amplify** (app `d1k79dwq6c1dnq`) → Environment variables: add
   `GOOGLE_IOS_CLIENT_ID=<the iOS client ID>` and redeploy. Until it is set,
   bearer requests are refused and the web editor is unaffected.
3. In `ios/project.yml`, replace `GOOGLE_CLIENT_ID` and `GOOGLE_REVERSED_CLIENT_ID`.
4. On a Mac:

   ```bash
   cd ios && xcodegen generate && open QuickPost.xcodeproj
   ```

   Run on your iPhone (team `V6JPQCD336`, same as Journal). To test against a
   local blog, change `BLOG_BASE_URL` in `project.yml`.

## Ideas for later

- A Share extension, so "Share → Quick Post" from Safari starts a link post.
- An App Icon and a Home Screen / Lock Screen widget that opens the composer.
