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

## Release (TestFlight)

Quick Post follows the shared app standard (`jimgreco/consolidated-deploy`
`docs/APP_STANDARD.md`), as Journal does. The blog's web server is not on the
shared host. Amplify deploys it from `main` through `amplify.yml`. So this repo
uses the standard's iOS-only `release.yml`, with no server job:

- Pull requests run `verify` (web lint/tests/build and the iOS unit tests).
- A push to `main` runs `verify`, then `testflight.yml` uploads a build through
  `jimgreco/release-tools/ios`, pinned like every other app.

## Turning it on (owner steps, once)

1. **Developer portal:** an App ID `com.jimgreco.quickpost` (no extra
   capabilities), and an App Store distribution provisioning profile for it
   named `Quick Post App Store`, signed by the existing distribution certificate.
2. **App Store Connect:** a new app record for that bundle ID. If Apple rejects
   the name "Quick Post" as taken (ITMS-90129, as happened with Journal), change
   `CFBundleDisplayName` and `CFBundleName` in `QuickPost/Info.plist`. Add
   yourself to an internal TestFlight group.
3. **Policy:** in `.github/scripts/release-policy.json`, fill `appId`,
   `profiles.app.uuid` (lowercase) and `groups`, in the same format as Journal's.
   `discover-audience` in release-tools prints `appId` and `groups` (GET only).
4. **Google:** the iOS OAuth client for `com.jimgreco.quickpost` is
   `1018348991868-khsbqgkv3vkligc53i1s3f60pdnkemki.apps.googleusercontent.com`.
5. **Repository secrets** (or the `production` environment): the TestFlight set
   from the app standard (`APP_STORE_CONNECT_KEY_ID`,
   `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY`,
   `IOS_DIST_CERT_P12`, `IOS_DIST_CERT_PASSWORD`, `KEYCHAIN_PASSWORD`), plus
   `IOS_API_BASE_URL=https://jim-greco.com`,
   `GOOGLE_IOS_CLIENT_ID=<client id above>` and
   `GOOGLE_IOS_REVERSED_CLIENT_ID=com.googleusercontent.apps.1018348991868-khsbqgkv3vkligc53i1s3f60pdnkemki`.
6. **Amplify** (app `d1k79dwq6c1dnq`) → Environment variables:
   `GOOGLE_IOS_CLIENT_ID=<client id above>`. Without it the blog refuses the
   app's requests, and the website editor is unaffected.
7. **Branch protection** on `main`, as in the standard: required checks
   `verify / verify-web` and `verify / ios-tests`, not strict.

## Local builds

`QuickPost.xcodeproj` is committed, like the other apps. For a device build,
put the Google client id and reversed id from step 4 into `project.yml` (or the
target's build settings) without committing them. After editing `project.yml`,
regenerate on a Mac and commit the result:

```bash
cd ios && xcodegen generate
```

## Ideas for later

- A Share extension, so "Share → Quick Post" from Safari starts a link post.
- An App Icon and a Home Screen / Lock Screen widget that opens the composer.
