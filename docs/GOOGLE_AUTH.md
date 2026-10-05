# Google Sign-In setup

HYDRA uses the native Google Sign-In SDK (`@react-native-google-signin/google-signin`) to obtain a Google
**ID token**, which the API verifies (`google-auth-library` → signature, issuer, expiry, audience,
`email_verified`) before issuing HYDRA's own access/refresh tokens. See [SECURITY.md §2](SECURITY.md#2-authentication)
for the account-linking rules (customers may self-register after privacy consent; staff must link from
their profile first).

Google Sign-In needs a **development or store build** — it does not work in Expo Go. Until the client IDs
are set, the button explains that Google sign-in is not configured (it never fakes a login).

## 1. Google Cloud project

1. <https://console.cloud.google.com> → create project **HYDRA PSG Electrical**.
2. **APIs & Services → OAuth consent screen**: External; app name “PSG Electrical”; support email; app
   logo; privacy policy URL; scopes `openid`, `email`, `profile` only. Publish the app (Testing mode limits
   sign-in to listed test users).

## 2. OAuth client IDs (APIs & Services → Credentials → Create credentials → OAuth client ID)

| Client | Settings | Used by |
| --- | --- | --- |
| **Web application** | No origins/redirects needed | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (app requests ID tokens for this audience) and API `GOOGLE_WEB_CLIENT_ID` |
| **Android** | Package `za.co.psgelectrical.hydra`; **SHA-1** of each signing key (see below) | Registers the app with Google; `GOOGLE_ANDROID_CLIENT_ID` on the API (accepted audience) |
| **iOS** | Bundle ID `za.co.psgelectrical.hydra` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, API `GOOGLE_IOS_CLIENT_ID`; its *iOS URL scheme* (`com.googleusercontent.apps.…`) → `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` |

SHA-1 fingerprints for the Android client (create one Android client per fingerprint):

- EAS-managed keystore: `eas credentials -p android` → select the build profile → copy **SHA1 Fingerprint**.
- Google Play App Signing (store installs): Play Console → *Test and release → App integrity → App signing
  key certificate* → SHA-1. Add this too, otherwise Play-installed builds fail with `DEVELOPER_ERROR`.

## 3. Configure HYDRA

API (`apps/api/.env` locally, App Service settings in Azure):

```
GOOGLE_WEB_CLIENT_ID=1234-abc.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=1234-def.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=1234-ghi.apps.googleusercontent.com
```

Mobile (`apps/mobile/.env` for local builds, and the EAS environment/GitHub variables for cloud builds):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234-abc.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=1234-ghi.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.1234-ghi
```

`app.config.ts` adds the Google Sign-In config plugin (iOS URL scheme) only when
`EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` is set. These values are public identifiers, not secrets.

## 4. Build and verify

```bash
cd apps/mobile
eas build --profile development --platform android   # install the APK, run `npx expo start --dev-client`
```

1. Guest → Sign in → **Continue with Google** → choose an account → accept the privacy notice (first time) → customer home.
2. Electrician/admin: sign in with password → Profile → **Link Google account**; afterwards Google sign-in works for that staff account.
3. A Google account whose email matches a staff user but is not linked is refused (no account takeover).

## Troubleshooting

| Error | Cause |
| --- | --- |
| `DEVELOPER_ERROR` (Android) | SHA-1 of the installed build's signing key not registered on an Android OAuth client, or wrong package name. |
| API `UNAUTHORIZED: Google sign-in could not be verified` | ID token audience not in the API's `GOOGLE_*_CLIENT_ID` list, or device clock skew. |
| iOS crash on tap | `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` missing when the build was made — rebuild. |
| “Google Sign-In requires the installed app” | Running in Expo Go/web preview; use a development build. |
