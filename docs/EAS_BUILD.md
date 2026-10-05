# Mobile builds with EAS (Android & iOS)

Native binaries are produced by **EAS Build** in Expo's cloud, so no Android SDK or Xcode is needed
locally. Configuration: `apps/mobile/app.config.ts` (identifiers, permissions, plugins) and
`apps/mobile/eas.json` (profiles). The JS bundle is verified on every CI run with `expo export` for both
platforms.

| Profile | Output | API | Purpose |
| --- | --- | --- | --- |
| `development` | Android APK with dev client | `http://10.0.2.2:4000` | Local development with native modules (Google Sign-In, camera) |
| `preview` | Android APK (internal) / iOS ad-hoc | staging | QA and client acceptance |
| `production` | Android **AAB**, iOS App Store IPA; build number auto-incremented | production | Store release |
| `admin-device` | Android APK (internal) with `READ_CALL_LOG` | production | Office work phone(s) only — missed-call monitoring. Never uploaded to Google Play. |

Identifiers: Android package and iOS bundle ID `za.co.psgelectrical.hydra`; scheme `hydra`; version
`1.0.0` (`runtimeVersion` policy `appVersion`). App version numbers are managed remotely by EAS
(`appVersionSource: remote`).

## One-time setup

```bash
npm install -g eas-cli
eas login                                   # Expo account of PSG Electrical (organisation recommended)
cd apps/mobile
eas init                                    # creates the EAS project; copy the projectId
```

Set `EXPO_PUBLIC_EAS_PROJECT_ID=<projectId>` (and optionally `EXPO_PUBLIC_EAS_OWNER=<org>`) in
`apps/mobile/.env`, as EAS environment variables (`eas env:create`), and as GitHub variables for the
[EAS workflow](../.github/workflows/eas-build.yml). Also provide the Google client IDs (see
[GOOGLE_AUTH.md](GOOGLE_AUTH.md)). Create an Expo access token for CI (expo.dev → Account → Access tokens)
and store it as the `EXPO_TOKEN` repository secret.

## Android

```bash
eas build --platform android --profile preview      # installable APK for testers
eas build --platform android --profile production   # Play Store AAB
```

1. On the first build, let EAS **generate and store the upload keystore** (or upload the company's). Back it
   up: `eas credentials -p android` → download keystore.
2. Register the keystore SHA-1 (and later the Play App Signing SHA-1) on the Google OAuth Android client.
3. Push notifications: upload the Firebase **FCM v1 service-account JSON** — `eas credentials -p android`
   → *Google Service Account* → *Push Notifications (FCM V1)*. Also provide the Firebase Android app's
   `google-services.json` as an EAS **file** environment variable (it is git-ignored and never committed):
   `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`
   for each environment you build. `app.config.ts` sets `android.googleServicesFile` from it.
4. Google Play Console: create the app (default language en-ZA), complete **Data safety** (collected:
   name, email, phone, precise location at check-in time, photos, payment info handled by Paystack;
   encrypted in transit; deletion requests supported), **content rating**, target audience, and the privacy
   policy URL.
5. Submit: `eas submit -p android --profile production` (uses a Play service-account key; `eas.json`
   submits to the **internal** track as a draft for review) — or upload the AAB manually the first time.

## iOS (requires an Apple Developer Program membership)

```bash
eas build --platform ios --profile production
eas submit -p ios --profile production
```

1. EAS signs in to the Apple Developer account and creates the distribution certificate, provisioning
   profile and **APNs key** automatically (choose “Let EAS manage”).
2. App Store Connect: create the app with bundle ID `za.co.psgelectrical.hydra`; fill in **App Privacy**
   (same data as the Play Data safety form) and export compliance (`usesNonExemptEncryption: false` is set —
   the app uses only standard HTTPS).
3. Permission strings shown to users are defined in `app.config.ts` (camera, location when in use, photo
   library). No background location, microphone or contacts access is requested.
4. Missed-call monitoring is not available on iOS (Apple does not permit call-log access); the admin screen
   says so. Office staff on iPhone can still log missed calls manually.
5. TestFlight: submitted builds appear in TestFlight for internal testers before App Review.

## Admin work-device build (missed calls)

```bash
eas build --platform android --profile admin-device
```

This profile sets `HYDRA_ENABLE_MISSED_CALL_MONITOR=true`, which makes the config plugin add
`READ_CALL_LOG`. Install the APK directly on the office phone(s) (MDM or `adb install`). Google Play
restricts call-log permissions to default dialer apps, so this variant must stay off the Play Store; the store
build is verified in CI never to contain `READ_CALL_LOG`. See [MISSED_CALLS.md](MISSED_CALLS.md).

## Over-the-air updates

`runtimeVersion` is tied to the app version, so JS-only fixes can be shipped with EAS Update to the same
version once `expo-updates` is added; native changes always require a new store build.

## Release checklist

- [ ] CI green; `npx expo-doctor` passes; `npm run build -w @hydra/mobile` exports both platforms.
- [ ] `EXPO_PUBLIC_API_URL` is the https production API (the app refuses http in production builds).
- [ ] Version bumped in `app.config.ts` for store-visible releases.
- [ ] Google SHA-1s registered; FCM and APNs credentials present; test push received.
- [ ] Store listings: screenshots from the high-fidelity screens, privacy policy URL, support email.
