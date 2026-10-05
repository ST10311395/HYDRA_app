# HYDRA — PSG Electrical & Cables / Trite Solar

HYDRA is the digital management system for **PSG Electrical and Cables / Trite Solar**. One React Native
app serves guests, customers, electricians, office administrators and the owner, backed by a Node.js REST
API and PostgreSQL. It replaces paper and spreadsheet processes for service requests, quotations,
dispatch, QR/GPS arrival check-in, live job milestones, materials and stock, compliance (CoC)
inspections, invoicing and payments, rewards, timesheets, leave, payroll, enquiries, missed-call
follow-up, audit and reporting — plus **HYDRA Smart Quote**, an AI quotation & triage assistant with
human-in-the-loop review ([docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md)).

| Area | Technology |
| --- | --- |
| Mobile (`apps/mobile`) | Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript (strict) · Expo Router · TanStack Query · Zustand · React Hook Form + Zod · SecureStore · Camera · Location · Notifications |
| API (`apps/api`) | Node.js 24 · Express 5 · TypeScript · Zod validation · Repository pattern over `pg` · JWT (jose) + rotating refresh tokens · Socket.IO · pino · OpenAPI 3 (Swagger UI) |
| Database | PostgreSQL 17/18 (Azure Database for PostgreSQL Flexible Server in production) · SQL migrations · seed |
| Shared (`packages/shared`) | Domain enums, lifecycle state machines, money/payroll maths, Zod DTO schemas used by both apps |
| Cloud target | Azure App Service · PostgreSQL Flexible Server · Blob Storage · Key Vault · Application Insights · GitHub Actions · EAS Build |

## Architecture at a glance

```
Mobile app (presentation) ──HTTPS/JSON + Socket.IO──▶ Express controllers (presentation)
                                                      └▶ services + state machines (business logic)
                                                          └▶ I*Repository / Postgres*Repository (data access)
                                                              └▶ PostgreSQL (constraints, triggers, transactions)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Security model: [docs/SECURITY.md](docs/SECURITY.md).
API reference: [docs/API.md](docs/API.md) and live Swagger at `http://localhost:4000/api/docs`.

## Repository layout

```
apps/api        REST API, migrations (apps/api/migrations), seed (apps/api/seeds), tests (apps/api/tests)
apps/mobile     Expo app: src/app (routes), src/design-system, src/features, src/api, src/__tests__,
                modules/missed-call-monitor (Android-only Kotlin module)
packages/shared Shared domain code
docs/           Architecture, security, API, deployment and integration guides; wireframes; reference PDF
.github/        CI, API deployment and EAS build workflows
```

## Prerequisites

- Node.js **≥ 20.19** (24 recommended) and npm 10+
- PostgreSQL is **not** required locally — `npm run db:start` runs a real embedded PostgreSQL. Docker users can use `docker compose up -d db` instead.
- For device testing: Expo Go works for most screens; Google Sign-In, the QR camera in production mode and the missed-call module need a **development build** (`eas build --profile development`) — see [docs/EAS_BUILD.md](docs/EAS_BUILD.md).
- No Android SDK or Xcode is needed: native binaries are built by EAS in the cloud.

## Installation

```bash
git clone <repo> && cd Hydra_App
npm install                     # also builds @hydra/shared (postinstall)
cp .env.example apps/api/.env   # then set SEED_DEMO_PASSWORD (and anything else you want to change)
```

Environment variables are documented inline in [`.env.example`](.env.example). Development runs with safe
fallbacks (simulated payments, local file storage, console email, SMS "not configured"); production refuses
to start with any of those fallbacks (`assertProductionSafety`).

## Database, migrations and seed

```bash
npm run db:start      # terminal 1 — embedded PostgreSQL on localhost:5433 (or: docker compose up -d db)
npm run db:migrate    # apply SQL migrations (checksum-guarded, one transaction per file)
npm run db:seed       # development demo data driven through the real services
npm run db:seed:ai    # Smart Quote defaults only (policies, approved knowledge, sample cases) — additive, safe on an existing DB
npm run db:reset      # drop + migrate + seed (refused when NODE_ENV=production)
```

## Manual testing every role (development accounts)

No production Google, Paystack, Twilio, SMTP or Azure credentials are needed. Passwords are **never
committed** — you choose one locally:

```bash
cp .env.example apps/api/.env
# edit apps/api/.env and set a local-only password of 12+ characters, e.g.
#   SEED_DEMO_PASSWORD=<your-local-test-passphrase>
npm run db:start      # terminal 1
npm run db:reset      # terminal 2 — wipes the LOCAL dev database, migrates and seeds demo data
npm run api           # terminal 2 (keep running)
npm run mobile        # terminal 3 — press w (web), a (Android emulator) or i (iOS simulator)
```

If `SEED_DEMO_PASSWORD` is left blank the seed generates a random password and prints it **once** in
the `db:reset` output. All demo accounts share that password:

| Role | Sign in with | Opens |
| --- | --- | --- |
| Customer | `customer@hydra.demo` (also `ayanda@hydra.demo`) | Customer app (first sign-in shows the guided onboarding) |
| Employee / electrician | `sipho@hydra.demo` **or** staff number `PSG-E-0003` (also `anele@` = `PSG-E-0004`, `ruan@hydra.demo` = `PSG-E-0005`) | Electrician app (Today · Calendar · Scan · Timesheet · Profile) |
| Office admin | `office@hydra.demo` or `PSG-A-0002` | Operations Center without owner modules |
| Owner / manager | `owner@hydra.demo` or `PSG-A-0001` | Operations Center **plus** Owner tools (reports, exports, audit, staff, POPIA requests, payroll approval) |

Everyone uses the same **Sign In** screen (the “Customer / Staff” tabs only change the wording). The
API returns the account's role and the app opens that role's workspace — the client never chooses it.
To create an additional owner on a fresh database: `npm run owner:create -w @hydra/api`.

**What you should see:** first launch → Welcome (Sign In · Create Account · Continue as Guest). Guests
browse Home · Services · Work · Quote · Contact and always have the account icon (top right) for
Sign In / Create Account. Signed-in users get an initials avatar there with Dashboard, Notifications,
Profile & settings, Website and Sign out. Sign out returns to Welcome.

Notes: login is rate-limited (10 attempts / 15 min per IP) — wait or restart the API if you hit it.
On **web** the session is held in memory only (no secure storage in browsers), so a page reload signs
you out; the native apps keep the session in the iOS Keychain / Android Keystore. Seeded marketing
content is flagged as demo content until PSG Electrical supplies approved data.

## Run

```bash
npm run api       # terminal 2 — API on 0.0.0.0:4000 (Swagger: /api/docs, health: /health); logs its LAN URL
npm run mobile    # terminal 3 — Expo dev server (press a for Android emulator, i for iOS simulator)
npm run jobs      # optional — standalone scheduled-jobs worker (the API also runs the scheduler in dev)
```

### Testing on a physical phone (same Wi-Fi)

The API binds to `0.0.0.0` (`HOST`) so other devices on the network can reach it. A phone cannot use
`localhost` or `10.0.2.2` — those point at the phone itself — so the app needs your PC's LAN IP:

```bash
npm run lan          # detects the LAN IP and writes it to apps/mobile/.env (EXPO_PUBLIC_API_URL)
                     # and apps/api/.env (PUBLIC_API_BASE_URL, used for photo links + sandbox checkout)
npm run lan -- 192.168.1.20   # or pass the IP explicitly
```

Then restart the API and start Expo with `npx expo start --clear` (env vars are inlined at bundle time).
Metro prints `[HYDRA] API http://… (env)` — that is the URL the app uses. Safety nets in development:

- If `EXPO_PUBLIC_API_URL` is blank, the app uses the Metro host's LAN IP (from the QR code) automatically.
- If it still says `localhost`/`127.0.0.1`/`10.0.2.2`, a **physical** device rewrites it to the Metro LAN IP
  (emulators/simulators keep it). Network errors in dev include the API URL being used.
- CORS: production allows only `CORS_ORIGINS`; development also accepts `localhost`, `127.0.0.1` and
  private-LAN origins (10.x, 172.16–31.x, 192.168.x), so Expo web works from either address.

**Windows firewall (one-time, admin PowerShell)** — needed when the Wi-Fi profile is *Public*:

```powershell
New-NetFirewallRule -DisplayName "HYDRA dev (API 4000, Metro 8081)" -Direction Inbound -Protocol TCP -LocalPort 4000,8081 -RemoteAddress LocalSubnet -Action Allow -Profile Any
```

Campus/guest Wi-Fi often blocks device-to-device traffic (client isolation). If the phone cannot open
`http://<LAN-IP>:4000/health` in its browser, connect the PC to the phone's hotspot, run `npm run lan`
again and restart the API and Expo.

Google Sign-In: without `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` the sign-in screen shows a disabled
“Google Sign-In unavailable” button with a “not configured” explanation; the API answers `/auth/google`
with `503 GOOGLE_NOT_CONFIGURED`. Email/password sign-in covers every role.

## Integrations (sandbox until credentials are supplied)

| Integration | Guide | Development behaviour |
| --- | --- | --- |
| Google Sign-In | [docs/GOOGLE_AUTH.md](docs/GOOGLE_AUTH.md) | Button explains it is not configured — never fakes a login |
| Payments (Paystack, ZAR) | [docs/PAYMENTS.md](docs/PAYMENTS.md) | Signed-webhook sandbox checkout page (`PAYMENT_PROVIDER=simulated`), refused in production |
| SMS / WhatsApp (Twilio) | [docs/SMS_TWILIO.md](docs/SMS_TWILIO.md) | Messages logged with delivery status `NOT_CONFIGURED`, never marked sent |
| Push notifications | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#push-notifications) | Expo push tokens (works in dev builds) |
| Azure (App Service, PostgreSQL, Blob, Key Vault, Insights) | [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md) | Local disk storage with HMAC-signed expiring URLs |
| Email (SMTP) | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#email) | Console outbox |
| AI provider (Smart Quote) | [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md#10-configuration) | `AI_PROVIDER=mock`: deterministic “Development AI simulation” (never claims image analysis); refused in production. `none` = human review only |

## HYDRA Smart Quote (AI quotation & triage assistant)

Customers describe an electrical/solar problem with photos (Dashboard → **HYDRA Smart Quote**) and get a
preliminary assessment: likely service, severity 1–5 with the reason, a server-calculated price range, the
target response window, follow-up questions and a confidence score. Deterministic safety rules (fire, smoke,
shock, exposed conductors, arcing, flooding, battery events…) can only raise severity; severity 4–5,
low-confidence, unsupported and failed-AI cases go to **Admin → More → AI Review**. Accepting a proposal creates a
normal `REQUESTED` job. The assistant “learns” only from knowledge an admin approves (retrieval, no model
training). The owner configures thresholds, severity targets, pricing and the provider in **Settings → AI
Assistant** (keys are never shown). Full design, configuration, demo script and limitations:
[docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md).

## Permissions and platform notes

- **Camera** is requested only when an electrician opens the QR scanner or someone attaches a photo.
- **Location** (foreground only) is requested only at the moment of confirming arrival; there is no background tracking.
- **Notifications** permission is requested after sign-in, never at first launch.
- **Missed-call monitoring** is Android-only, behind a feature flag and an explicit consent screen, and only in the
  separate `admin-device` build. iOS does not allow third-party call-log access; the app says so. See
  [docs/MISSED_CALLS.md](docs/MISSED_CALLS.md).

## Testing and quality gates

```bash
npm run lint          # ESLint: shared, api, mobile
npm run typecheck     # tsc --noEmit: shared, api, mobile (incl. tests)
npm test              # shared (Vitest) · api (Vitest + Supertest against real PostgreSQL) · mobile (Jest + RNTL)
npm run build         # shared + api (tsc) + mobile (expo export → Android & iOS Hermes bundles)
npm run check:routes -w @hydra/mobile   # static audit: every navigation target resolves to a screen
npx expo-doctor       # (in apps/mobile) Expo SDK dependency/config validation
```

The API suite starts its own throwaway PostgreSQL on port 5434 (or uses `TEST_DATABASE_URL`, as CI does).
Current totals: shared 17 · API 205 · mobile 203 (Smart Quote: API 92, mobile 20).
If an interrupted run left a test cluster behind (“pre-existing shared memory block is still in use”), run with
`TEST_PG_DIR=.pgdata-test-2 TEST_PG_PORT=5435 npm test` (or stop the leftover `postgres.exe`). The phone walkthrough checklist (with what to retest
first) is [docs/MANUAL_TEST_MATRIX.md](docs/MANUAL_TEST_MATRIX.md).
Current results are recorded in [FINAL_COMPLETION_REPORT.md](FINAL_COMPLETION_REPORT.md).

## Build and deployment

- API → Azure App Service via the manual, environment-protected [deploy workflow](.github/workflows/deploy-api.yml): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- Mobile → EAS Build (Android AAB/APK, iOS IPA) and EAS Submit: [docs/EAS_BUILD.md](docs/EAS_BUILD.md).
- CI on every push/PR: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `db:start` says port 5433 is in use | A cluster is already running — skip `db:start`. If it is unresponsive: `node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe stop -D apps/api/.pgdata -m fast` (or end the `postgres.exe` processes started from that path). Keeping the repo outside a OneDrive-synced folder avoids file-lock stalls. |
| API hangs at start / queries time out although port 5433 is listening | The embedded cluster stalled (OneDrive file locks). If `pg_ctl stop` also hangs, end the `postgres.exe` processes started from `node_modules/@embedded-postgres/windows-x64` and run `npm run db:start` again — PostgreSQL recovers from its WAL. |
| Arrival QR / scanner in a phone browser | Over plain `http://` LAN, browsers expose no wake-lock or camera API. The QR still works (the screen may dim); the scanner explains that scanning needs the app. Use the Expo app for camera tests. |
| App shows “offline or the server is unreachable” | Check `EXPO_PUBLIC_API_URL`; emulator uses `10.0.2.2`, devices need your LAN IP; API must be running. |
| “Invalid hook call” / duplicate React | Only one React may be installed. The root `package.json` pins it with `overrides`; run `npm install` from the repo root. |
| `npx expo install` fails | npm 11 blocks unknown install scripts; install Expo packages with `npm install -w @hydra/mobile <pkg>@<version from node_modules/expo/bundledNativeModules.json>`. |
| Google button says “not configured” | Set the `EXPO_PUBLIC_GOOGLE_*` client IDs and use a development build — see docs/GOOGLE_AUTH.md. |
| Payments stay pending locally | Complete the sandbox checkout page that opens in the in-app browser; it posts a signed webhook to the API. |
| API refuses to start in production | Read the “Unsafe production configuration” message — a required secret or TLS setting is missing. |
