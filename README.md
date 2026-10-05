# HYDRA — PSG Electrical & Cables / TRITE SOLAR

**Digital service management for PSG Electrical & Cables and TRITE SOLAR.**

HYDRA is the digital management system for **PSG Electrical and Cables / TRITE SOLAR**: a React Native and
Expo application backed by a Node.js, Express and PostgreSQL REST API. One app serves guests, customers,
electricians, office administrators and the owner. It brings customer enquiries, electrical and solar service
requests, quotations, field work, invoicing and business administration into one system, replacing paper and
spreadsheet processes for dispatch, QR/GPS arrival check-in, live job milestones, materials and stock,
compliance (CoC) inspections, payments, rewards, timesheets, leave, payroll, missed-call follow-up, audit and
reporting — plus **HYDRA Smart Quote**, an AI quotation & triage assistant with human-in-the-loop review
([docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md)).

Repository: [ST10311395/HYDRA_app](https://github.com/ST10311395/HYDRA_app)

This README describes the repository as of 5 October 2026. Local demonstration features run without any cloud
credentials. The production API is hosted on Azure App Service (see
[Build and deployment](#build-and-deployment)); other integration adapters (payments, SMS, email, AI providers)
are only live once their credentials are configured — their presence in the code does not establish that those
services are live.

## Contents

- [Features and user roles](#features-and-user-roles)
- [Technology and architecture](#technology-and-architecture)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Manual testing every role](#manual-testing-every-role-development-accounts)
- [Testing on a physical phone](#testing-on-a-physical-phone-same-wi-fi)
- [Integrations and external services](#integrations-and-external-services)
- [HYDRA Smart Quote](#hydra-smart-quote-ai-quotation--triage-assistant)
- [Permissions and platform notes](#permissions-and-platform-notes)
- [Testing and quality checks](#testing-and-quality-checks)
- [Build and deployment](#build-and-deployment)
- [Troubleshooting](#troubleshooting)
- [Team workflow](#team-workflow)
- [Generative AI declaration](#generative-ai-declaration)
- [Code attribution and references](#code-attribution-and-references)

## Features and user roles

| Role | Main functions |
| --- | --- |
| Guest | Browse Home · Services · Work · Quote · Contact; Sign In or Create Account from the account icon. |
| Customer | Register and sign in; request electrical or solar services; track jobs; accept or decline quotations; view invoices and payments; manage notification preferences; use Smart Quote. |
| Employee / electrician | View assigned work; use QR and GPS attendance/check-in features; clock in and out; update work progress and materials; complete jobs and view relevant job information. |
| Office administrator | Manage customers, service requests, quotations, assignments, invoices, payments, inventory, missed-call follow-up and AI review cases. |
| Owner | Administration plus restricted settings, workforce/payroll, reports and exports, audit records, staff accounts, POPIA requests and AI policy controls. |

Additional workflows include a Certificate of Compliance register, staff records, service types, discounts,
rewards, leave and customer data requests. API permissions enforce access to records and restricted operations;
hiding a screen alone is insufficient protection.

## Technology and architecture

| Component | Technology and purpose |
| --- | --- |
| Mobile application (`apps/mobile`) | Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript (strict) · Expo Router · TanStack Query · Zustand · React Hook Form + Zod · SecureStore · Camera · Location · Notifications — screens, navigation and device capabilities (Meta Platforms, Inc., 2026a; 2026b; Expo, 2026). |
| Backend (`apps/api`) | Node.js 24 · Express 5 · TypeScript · Zod validation · repository pattern over `pg` · JWT (jose) + rotating refresh tokens · Socket.IO · pino · OpenAPI 3 (Swagger UI) (OpenJS Foundation, 2026). |
| Shared contracts (`packages/shared`) | Domain enums, lifecycle state machines, money/payroll maths and Zod DTO schemas used by both apps (Microsoft, 2026e). |
| Database | PostgreSQL 17/18 (Azure Database for PostgreSQL Flexible Server in production) · SQL migrations · seed (PostgreSQL Global Development Group, 2026). |
| Package management | npm workspaces for the shared, API and mobile packages (npm, Inc., 2026). |
| Quality tools | ESLint, TypeScript, Jest for mobile tests and Vitest for API/shared tests (ESLint, 2026; Microsoft, 2026e; Meta Open Source, 2026). |
| Cloud | Azure App Service · PostgreSQL Flexible Server · Blob Storage · Key Vault · Application Insights · EAS Build (Microsoft, 2026a; 2026b; 2026c; 2026d; Expo, 2026). |
| Version control and automation | Git, GitHub and GitHub Actions (Software Freedom Conservancy, 2026; GitHub, 2026a; 2026b). |
| Development editor | Visual Studio Code is a suitable editor for the monorepo (Microsoft, 2026f). |

```
Mobile app (presentation) ──HTTPS/JSON + Socket.IO──▶ Express controllers (presentation)
                                                      └▶ services + state machines (business logic)
                                                          └▶ I*Repository / Postgres*Repository (data access)
                                                              └▶ PostgreSQL (constraints, triggers, transactions)
```

The mobile client communicates with the REST API, which validates requests, authorises actions and accesses
PostgreSQL and configured service providers. REST architecture is described by Fielding (2000). Separation of
interface, service and persistence responsibilities can be evaluated against Martin (2017), while incremental
code improvement is discussed by Fowler (2018). These references provide technical context; they do not
establish that project code was copied from the sources.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Security model: [docs/SECURITY.md](docs/SECURITY.md).
API reference: [docs/API.md](docs/API.md), [docs/openapi.json](docs/openapi.json) and live Swagger at
`http://localhost:4000/api/docs`.

## Project structure

```
HYDRA_app/
├── apps/
│   ├── api/                 # REST API: src, migrations, seeds, scripts and tests
│   └── mobile/              # Expo app: src/app (routes), src/design-system, src/features, src/api,
│                            #   src/__tests__, modules/missed-call-monitor (Android-only Kotlin module)
├── packages/
│   └── shared/              # Shared schemas, contracts, state machines and utilities
├── scripts/
│   └── configure-lan.mjs    # Local device connectivity configuration (npm run lan)
├── docs/                    # Architecture, security, API, deployment and integration guides
│   ├── AI_ASSISTANT.md      # Smart Quote architecture and demonstration guide
│   ├── openapi.json         # API specification
│   ├── reference/           # Project reference document (PDF)
│   └── wireframes/          # High-fidelity wireframes
├── .github/workflows/       # CI, EAS build and API deployment workflows
├── .env.example             # Configuration template; contains no real secrets
├── docker-compose.yml       # Optional PostgreSQL for Docker users
├── package.json             # Workspace commands
└── README.md
```

## Local setup

### 1. Prerequisites

- Git, and Node.js **≥ 20.19** with npm 10+. CI and the deployment build use Node.js **24** (recommended); use
  the version compatible with the checked-in dependencies and lockfile.
- PostgreSQL is **not** required locally — `npm run db:start` runs a real embedded PostgreSQL. Docker users can
  use `docker compose up -d db` instead.
- For device testing: Expo Go works for most screens; Google Sign-In, the QR camera in production mode and the
  missed-call module need a **development build** (`eas build --profile development`) — see
  [docs/EAS_BUILD.md](docs/EAS_BUILD.md).
- No Android SDK or Xcode is needed: native binaries are built by EAS in the cloud. Use an Android
  device/emulator or a suitable iOS environment for native testing.

### 2. Clone and install

```bash
git clone https://github.com/ST10311395/HYDRA_app.git
cd HYDRA_app
npm ci                          # also builds @hydra/shared (root postinstall script)
```

### 3. Configure the environment

Copy the root `.env.example` to `apps/api/.env` and `apps/mobile/.env`:

```powershell
Copy-Item .env.example apps/api/.env      # Windows PowerShell (macOS/Linux: cp .env.example apps/api/.env)
Copy-Item .env.example apps/mobile/.env
```

The API uses server settings in `apps/api/.env`. The mobile application uses public `EXPO_PUBLIC_*` settings;
place no server secrets in those variables. For a cleaner mobile environment, retain only the relevant public
settings in its `.env` file. Every variable is documented inline in [`.env.example`](.env.example).

Generate a separate random value for each of `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and
`FILE_URL_SIGNING_SECRET` (run the command once per secret and paste the results into the API environment file):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Keep local development settings such as:

```dotenv
NODE_ENV=development
APP_ENV=local
PORT=4000
DATABASE_URL=postgres://hydra:hydra_local_dev@localhost:5433/hydra
DATABASE_SSL=false
STORAGE_PROVIDER=local
PAYMENT_PROVIDER=simulated
EMAIL_PROVIDER=console
SMS_PROVIDER=none
WHATSAPP_PROVIDER=none
AI_PROVIDER=mock
```

Development runs with safe fallbacks (simulated payments, local file storage, console email, SMS "not
configured"); production refuses to start with any of those fallbacks (`assertProductionSafety`). Complete any
remaining required settings using `.env.example` and the API configuration validator. Real Google
authentication and external providers require their own credentials. **Never commit populated `.env` files or
real keys.**

### 4. Start and initialise PostgreSQL

```bash
npm run db:start      # terminal 1 — embedded PostgreSQL on localhost:5433 (or: docker compose up -d db); keep it open
npm run db:migrate    # terminal 2 — apply SQL migrations (checksum-guarded, one transaction per file)
npm run db:seed       # development demo data driven through the real services
npm run db:seed:ai    # Smart Quote defaults only (policies, approved knowledge, sample cases) — additive, safe on an existing DB
npm run db:reset      # drop + migrate + seed (refused when NODE_ENV=production)
```

`db:seed` supplies demonstration accounts and business data. `db:reset` removes local database data before
recreating and seeding it — use it only when intentionally rebuilding a disposable development database.

### 5. Start the API and background worker

```bash
npm run api       # API on 0.0.0.0:4000 (Swagger: /api/docs, health: /health, endpoints: /api/v1); logs its LAN URL
npm run jobs      # optional — standalone scheduled-jobs worker (the API also runs the scheduler in dev)
```

### 6. Launch the mobile application

```bash
npm run lan       # physical phone only — writes your PC's LAN IP to the .env files (see below)
npm run mobile    # Expo dev server — press w (web), a (Android emulator) or i (iOS simulator), or scan the QR code
```

Native integrations such as Google Sign-In require an appropriate development build. Use the repository's EAS
`development` profile when Expo Go cannot load a required native module. The `development`, `preview`,
`admin-device` and `production` profiles are defined in [`apps/mobile/eas.json`](apps/mobile/eas.json); cloud
profiles require an Expo account and correct project configuration.

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

## Testing on a physical phone (same Wi-Fi)

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

## Integrations and external services

| Service | Purpose | Guide | Development behaviour |
| --- | --- | --- | --- |
| Azure App Service | API hosting (production: `hydra-psg-api`) (Microsoft, 2026a) | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | `npm run api` on localhost:4000 |
| Azure Database for PostgreSQL | Managed production database; requires secure connection settings (Microsoft, 2026c) | [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md) | Embedded PostgreSQL on :5433 |
| Azure Blob Storage | Private file storage, selected with `STORAGE_PROVIDER=azure` (Microsoft, 2026b) | [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md) | Local disk storage with HMAC-signed expiring URLs |
| Azure Key Vault / Application Insights | Secret management and telemetry (Microsoft, 2026d) | [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md) | Not used |
| Google Sign-In | OAuth sign-in; requires client IDs and platform configuration | [docs/GOOGLE_AUTH.md](docs/GOOGLE_AUTH.md) | Button explains it is not configured — never fakes a login |
| Payments (Paystack, ZAR) | Real card/EFT payments | [docs/PAYMENTS.md](docs/PAYMENTS.md) | Signed-webhook sandbox checkout page (`PAYMENT_PROVIDER=simulated`), refused in production |
| SMS / WhatsApp (Twilio) | Optional customer messaging | [docs/SMS_TWILIO.md](docs/SMS_TWILIO.md) | Messages logged with delivery status `NOT_CONFIGURED`, never marked sent |
| Push notifications (Expo) | Job and account notifications | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#push-notifications) | Expo push tokens (works in dev builds); in-app notifications always available |
| Email (SMTP) | Password resets and invitations | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#email) | Console outbox |
| AI provider (Smart Quote) | Preliminary quotation & triage | [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md#10-configuration) | `AI_PROVIDER=mock` deterministic simulation; see below |

Keep simulated AI/payment modes and console email out of production — the API refuses to start with them.
Confirm hosting cost and subscription eligibility before provisioning additional services.

## HYDRA Smart Quote (AI quotation & triage assistant)

Customers describe an electrical/solar problem with photos (Dashboard → **HYDRA Smart Quote**) and get a
preliminary assessment: likely service category, severity 1–5 with the reason, a server-calculated indicative
price range, the target response window, follow-up questions and a confidence score. Deterministic safety rules
(fire, smoke, shock, exposed conductors, arcing, flooding, battery events…) can only raise severity; severity
4–5, low-confidence, unsupported and failed-AI cases go to the administrator review queue (**Admin → More → AI
Review**). Accepting a proposal creates a normal `REQUESTED` service request.

The implementation combines deterministic safety rules, approved knowledge retrieval, validated provider output
and server-side pricing/escalation rules. The assistant “learns” only from knowledge and staff resolutions an
admin approves (retrieval) — this does not retrain model weights. The owner configures thresholds, severity
targets, pricing and the provider in **Settings → AI Assistant** (keys are never shown). Full architecture,
endpoints, configuration, demonstration scenarios and limitations: [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md).

| Provider mode (`AI_PROVIDER`) | Behaviour |
| --- | --- |
| `mock` | Labelled “Development AI simulation”; useful without credentials; does not analyse photographs. Refused in production. |
| `none` | Human review mode only (production default when unset). |
| `gemini` | Google Gemini provider adapter; needs a server-side `AI_API_KEY` and compatible model. |
| `anthropic` | Anthropic provider adapter; needs a server-side key and compatible model. |
| `openai` | OpenAI-compatible adapter; needs a server-side key, model and suitable endpoint. |

Provider adapters in the repository do not prove a successful live integration. Confirm the actual environment
and provider before demonstrating live AI. Mock responses and development pricing must be identified
accurately. Smart Quote provides preliminary service triage, not electrical repair instructions or a final
approved quotation.

## Permissions and platform notes

- **Camera** is requested only when an electrician opens the QR scanner or someone attaches a photo.
- **Location** (foreground only) is requested only at the moment of confirming arrival; there is no background tracking.
- **Notifications** permission is requested after sign-in, never at first launch.
- **Missed-call monitoring** is Android-only, behind a feature flag and an explicit consent screen, and only in the
  separate `admin-device` build. iOS does not allow third-party call-log access; the app says so. See
  [docs/MISSED_CALLS.md](docs/MISSED_CALLS.md).

## Testing and quality checks

Run from the repository root:

```bash
npm run lint                            # ESLint: shared, api, mobile
npm run typecheck                       # tsc --noEmit: shared, api, mobile (incl. tests)
npm test                                # shared (Vitest) · api (Vitest + Supertest against real PostgreSQL) · mobile (Jest + RNTL)
npm run build                           # shared + api (tsc) + mobile (expo export → Android & iOS Hermes bundles)
npm run check:routes -w @hydra/mobile   # static audit: every navigation target resolves to a screen
npm run doctor -w @hydra/mobile         # expo-doctor: Expo SDK dependency/config validation
```

The root commands cover all three workspaces. The mobile build exports Android and iOS bundles; it does not by
itself produce a signed installable APK or App Store release (use EAS — see below). The API suite starts its own
throwaway PostgreSQL on port 5434 (or uses `TEST_DATABASE_URL`, as CI does). If an interrupted run left a test
cluster behind (“pre-existing shared memory block is still in use”), run with
`TEST_PG_DIR=.pgdata-test-2 TEST_PG_PORT=5435 npm test` (or stop the leftover `postgres.exe`).

Test coverage includes account/role behaviour, customer requests, quotations, job assignment, attendance,
invoicing, administration and Smart Quote. Results recorded on 5 October 2026 (`main`): lint, typecheck and
build passed; tests shared 17 · API 245 · mobile 203, all passing; route audit 243 navigation targets → 88 routes;
expo-doctor 21/21. Record actual results again for the version being submitted. The phone walkthrough checklist
(with what to retest first) is [docs/MANUAL_TEST_MATRIX.md](docs/MANUAL_TEST_MATRIX.md).

Security review should consider request validation, ownership checks, authentication, rate limits, secret
management and private file access against OWASP guidance (OWASP Foundation, 2021; 2023). These references are
review criteria, not a certification of security compliance.

## Build and deployment

The repository includes GitHub Actions workflows for CI, EAS builds and manually requested Azure API
deployments.

### API → Azure App Service

| Item | Value |
| --- | --- |
| Azure App Service | `hydra-psg-api` (South Africa North) |
| Production API | https://hydra-psg-api-dqezcvhufjacdhfr.southafricanorth-01.azurewebsites.net |
| Health check | `GET /health` → `{"status":"ok"}` |
| Deployment workflow | [.github/workflows/deploy-api.yml](.github/workflows/deploy-api.yml) — manual `workflow_dispatch` only |
| Deployment authentication | Azure App Service **publish profile** |
| GitHub environment | `production` (required reviewers, restricted to `main`) |

The workflow builds `@hydra/shared` and the API, assembles a self-contained package, applies pending database
migrations (`DATABASE_URL` with `DATABASE_SSL=true`), deploys with `azure/webapps-deploy@v3` and polls `/health`.
It reads the `production` environment secrets `AZURE_WEBAPP_PUBLISH_PROFILE` and `DATABASE_URL`, and the
variables `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_SLOT` and `API_BASE_URL`. Secret values live only in GitHub
environment secrets and Azure Key Vault — never in the repository. Setup, release, rollback and migration
procedures: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); one-time infrastructure: [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md).

### Mobile → EAS Build

Android AAB/APK and iOS IPA builds and store submission use EAS Build/Submit with the profiles in
[`apps/mobile/eas.json`](apps/mobile/eas.json) (`development`, `preview`, `admin-device`, `production`); the
hosted profiles point at the production API above. See [docs/EAS_BUILD.md](docs/EAS_BUILD.md) and the
[EAS build workflow](.github/workflows/eas-build.yml).

### Continuous integration

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs lint, typecheck, shared/API/mobile tests (API against a
PostgreSQL service), the API build, route audit, Expo config checks, expo-doctor and the mobile export on every
push and pull request. Nothing deploys from CI.

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

## Team workflow

Work on individual feature branches, review changes and merge into `main` after the team agrees that its work is
ready. For example:

```bash
git switch -c feature/hydra-your-name
git status
git add README.md
git commit -m "docs: add HYDRA README and AI declaration"
git push -u origin feature/hydra-your-name
```

If the branch already exists, switch to it without `-c`. Commit only the intended files and exclude secrets,
generated uploads and local database files. Pull (merge) the latest `main` before pushing to it; never rebase or
force-push shared history. Git and GitHub documentation explain the underlying collaboration tools (Software
Freedom Conservancy, 2026; GitHub, 2026b).

## Generative AI declaration

### Scope and tools disclosed

Generative AI assistance is disclosed for HYDRA planning, requirements interpretation, documentation, diagram
review, implementation assistance, troubleshooting and verification support. Claude/Claude Code (Anthropic) was
used during the project, including development assistance (Anthropic, 2026a; 2026b). ChatGPT (OpenAI) was used
for guidance, documentation and preparation of this README (OpenAI, 2026). Claude Code also assisted in
combining the team's two README versions into this document on 5 October 2026.

This declaration covers assistance in producing the assessment and project. The runtime Smart Quote feature
described above is a separate application capability; a configured provider does not imply that it was used to
author submitted work. Claude is not a runtime dependency of HYDRA.

### Disclosure record

| Item | Disclosure |
| --- | --- |
| Assessment sections/work | HYDRA requirements and planning; supporting documentation and diagrams; code implementation/refinement; debugging and checks; README and reference presentation. |
| Tools | Claude/Claude Code by Anthropic; ChatGPT by OpenAI. Exact model/version information should be taken from the retained interaction records rather than inferred. |
| Purpose | Brainstorming, interpreting requirements, structuring explanations, implementation assistance, investigating errors, suggesting checks and improving clarity. |
| Documented dates | The supplied annexure records Claude interactions on 10 August 2026 (Screenshots 1–23) and 17 August 2026 (Screenshots 24–32), with a declaration dated 11 September 2026. This README was prepared with ChatGPT assistance on 5 October 2026. Those annexure dates do not represent the complete development-assistance period. |
| Existing evidence | HYDRA_AI_Usage_Disclosure_Annexure.pdf contains 32 interaction screenshots. Its summary states that screenshots were supplied because a shareable chat link was unavailable. |
| Additional evidence required for complete disclosure | Retain relevant Claude Code implementation/debugging records and this ChatGPT interaction with the submission. The annexure's documentation/planning evidence alone does not document every subsequent coding interaction. |

### Declaration statement

We disclose the use of generative AI as described in this README and the accompanying evidence. AI assistance
included implementation support as well as planning and documentation. AI-produced suggestions, explanations and
code must be reviewed against the project requirements and checked before they are relied upon or submitted.

The submitting team remains responsible for the final code, accuracy of claims, source attribution, test results
and compliance with the assessment's AI-use requirements. This README is an AI-assisted disclosure draft; it does
not create signatures or certify that every member has reviewed it. Each member should confirm that the final
disclosure reflects their actual use and that relevant evidence is included.

Store the supplied annexure alongside this README if submitting it with the repository. Its original disclosure
relates to the interactions it contains; supplement it with later development evidence instead of treating it as
a complete coding-use record.

## Code attribution and references

Hand-written source files carry a short `Code Attribution` comment listing only the references relevant to that
file. SQL migrations are excluded on purpose: the migration runner checksums each applied file, so editing one
would be refused as schema drift. JSON, lock files, generated output and secrets carry no comments. The Claude
Code documentation is cited where Claude Code assisted development (the Smart Quote AI module and the
Gemini/EAS integration). Visual Studio Code and GitHub documentation informed the development workflow rather
than specific files.

Documentation references acknowledge technical resources. A general reference list does not identify which files
contain adapted code. Where code is directly copied or adapted, add a precise acknowledgement with the source,
affected file/function and nature of the adaptation. AI records should identify the corresponding implementation
assistance. Anthropic's product references are included because Claude is explicitly disclosed.

The references below follow the IIE Harvard Anglia guide: alphabetical author ordering, with same-author,
same-year works distinguished by letters. All sources from both team reference lists are retained, including
Fielding (2000). Access dates match those in the source-file `Code Attribution` comments where a source is cited
in code; website years and access dates are the details supplied by the team, not independently established
publication dates.

### References

- Anthropic 2026a. Claude. [Online]. Available at: https://claude.ai/ [Accessed 5 October 2026].
- Anthropic 2026b. Claude Code documentation. [Online]. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
- ESLint 2026. ESLint documentation. [Online]. Available at: https://eslint.org/docs/latest/ [Accessed 5 September 2026].
- Expo 2026. Expo documentation. [Online]. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
- Fielding, R.T. 2000. Architectural styles and the design of network-based software architectures. Doctoral dissertation. University of California, Irvine.
- Fowler, M. 2018. Refactoring: Improving the design of existing code. 2nd ed. Boston: Addison-Wesley.
- GitHub 2026a. GitHub Actions documentation. [Online]. Available at: https://docs.github.com/en/actions [Accessed 2 September 2026].
- GitHub 2026b. GitHub documentation. [Online]. Available at: https://docs.github.com/ [Accessed 15 September 2026].
- Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
- Meta Open Source 2026. Jest documentation. [Online]. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
- Meta Platforms, Inc. 2026a. React documentation. [Online]. Available at: https://react.dev/ [Accessed 16 September 2026].
- Meta Platforms, Inc. 2026b. React Native documentation. [Online]. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
- Microsoft 2026a. Azure App Service documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/app-service/ [Accessed 5 October 2026].
- Microsoft 2026b. Azure Blob Storage documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/storage/blobs/ [Accessed 20 August 2026].
- Microsoft 2026c. Azure Database for PostgreSQL documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/postgresql/ [Accessed 1 October 2026].
- Microsoft 2026d. Azure Key Vault documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/key-vault/ [Accessed 5 October 2026].
- Microsoft 2026e. TypeScript documentation. [Online]. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
- Microsoft 2026f. Visual Studio Code documentation. [Online]. Available at: https://code.visualstudio.com/docs [Accessed 23 August 2026].
- npm, Inc. 2026. npm documentation. [Online]. Available at: https://docs.npmjs.com/ [Accessed 5 September 2026].
- OpenAI 2026. ChatGPT. [Online]. Available at: https://chatgpt.com/ [Accessed 5 October 2026].
- OpenJS Foundation 2026. Node.js documentation. [Online]. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
- OWASP Foundation 2021. OWASP Top Ten Web Application Security Risks. [Online]. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
- OWASP Foundation 2023. OWASP API Security Top 10. [Online]. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
- PostgreSQL Global Development Group 2026. PostgreSQL documentation. [Online]. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
- Software Freedom Conservancy 2026. Git documentation. [Online]. Available at: https://git-scm.com/doc [Accessed 28 September 2026].
