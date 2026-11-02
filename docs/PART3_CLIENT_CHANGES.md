# Part 3 — PSG client change inventory and acceptance checklist

Working record for the Part 3 client feedback round. The full client brief is
[`HYDRA_PART3_CLIENT_CHANGE_REQUIREMENTS.md`](../HYDRA_PART3_CLIENT_CHANGE_REQUIREMENTS.md); this file maps
it onto the actual code, tracks progress and records anything that still needs owner confirmation.

- **Branch:** `feature/part3-client-changes`, created from `main` @ `2f4900d`.
- **Reference images:** `part3-reference/` (local only, gitignored — the portfolio slides include third-party
  client logos and are not ours to redistribute).
- **Rule of thumb:** change claims and presentation, not capability. Roles, RBAC, API contracts, database
  schema, enums, workflows, payments and integrations stay as they are unless a linked bug blocks a UI change.

## 1. Approved business facts

Sources: PSG website (<https://psg-electrical-site.axiomcompute.workers.dev/>), the owner's company
portfolio (`part3-reference/Screenshot 2026-11-01 2031*.png`) and the owner confirmations of 2 November 2026
([`HYDRA_PART3_OWNER_CONFIRMED_DETAILS.md`](../HYDRA_PART3_OWNER_CONFIRMED_DETAILS.md)), which take precedence.

| Fact | Value used in the app | Source |
| --- | --- | --- |
| Trading name | PSG Electrical & Cables (solar division: Trite Solar) | Website, portfolio |
| Strapline | Innovation-driven electrical solutions | Website, portfolio cover |
| Phone numbers | Ricky: 082 603 9283 (primary, header call button) · Keoran: 072 752 0848 | Owner confirmed |
| Email addresses | General enquiries: info@psgelectrical.co.za · Solar (Trite Solar): trite@polka.co.za | Owner confirmed |
| WhatsApp | 082 603 9283 (`https://wa.me/27826039283`) | Owner confirmed |
| Office hours | Monday–Friday, 07:00–18:00 (no weekend, after-hours or response-time promise) | Owner confirmed |
| Experience | 25+ years (no founding year is stated) | Owner confirmed |
| Warranty | 12-month warranty on workmanship only (not supplied equipment or materials) | Owner confirmed |
| Clients | African Logistics Services, Swift Chemicals, Fashion Fusion, Hi-Tap Bolt & Tool, UKZN — names, portfolio descriptions and logos | Owner permission; portfolio |
| Offices | None besides the business itself; no regional offices or branch managers | Owner confirmed |
| Services | Electrical installations · Fault finding · Distribution boards · Compliance (CoC, SANS 10142-1) · Maintenance & repairs · Solar & backup power | Website |
| Capability areas | Industrial installations and upgrades · cable management · DB installation/reconfiguration · fault finding and diagnostics · maintenance in operational environments · solar integration support · hazardous-area compliance and installations | Portfolio |
| Sectors | Industrial & manufacturing · retail & commercial · logistics & warehousing · institutional facilities · chemical & hazardous environments | Portfolio |
| Quality statement | Work adheres to SANS 10142 wiring standards, CoC requirements and industry best practice; priorities are safety, compliance and long-term reliability | Portfolio |
| Quote intake categories | New installation · Fault or repair · DB board · Compliance (CoC) · Solar & backup · Maintenance | Website |

### Owner questions and how they were resolved (2 November 2026)

| # | Question | Resolution |
| --- | --- | --- |
| Q1 | Which email addresses are current? | **Resolved:** info@psgelectrical.co.za and trite@polka.co.za (Trite Solar), both shown. |
| Q2 | Primary number; may personal names be shown? | **Resolved:** both shown as Ricky / Keoran; header dials 082 603 9283 (owner may still name a different primary). |
| Q3 | Days of operation. | **Resolved:** Monday–Friday, 07:00–18:00. |
| Q4 | “25+ years” experience. | **Resolved:** confirmed; shown on Home, Work, Why PSG and Team. |
| Q5 | Permission to show portfolio client names and logos. | **Resolved:** confirmed; the five portfolio clients are shown on Work and Home with their portfolio logos. |
| Q6 | Original logo artwork. | **Partly resolved:** a recreated PNG lockup was supplied (not an original vector). Used on welcome and loading screens; vector mark kept for header and icons. Owner approval of the recreation still pending. |
| Q7 | Website address (`www.psgelectrical.co.za` vs the workers.dev URL). | **Open:** no website link is shown in the app. |
| Q8 | WhatsApp number. | **Resolved:** 082 603 9283. |
| Q9 | Offices and department desks. | **Resolved:** no additional offices; none are shown, even if an older database still returns seeded ones. |
| Q10 | Service “starting from” prices (seeded: e.g. DB boards R45 000, fault finding R1 450). | **Open:** unchanged business data; owner to review in Admin → Service types. Not advertised as quoted prices. |
| Q11 | AI triage response windows for levels 1–2 (“3–5 business days”, “1–3 business days”). | **Open:** unchanged owner-editable defaults; business hours set to Mon–Fri 07:00–18:00. |
| Q12 | Warranty period in the default quote terms. | **Resolved:** 12-month warranty on workmanship only; default terms and the FAQ say so explicitly. |

## 2. Claims to remove or reword

| Claim currently in the app | Where (found in audit) | Replacement |
| --- | --- | --- |
| "24/7 Emergency" CTA, header "Emergency" button, "Emergency: call the 24/7 line" | `components/layout.tsx`, guest home, `marketing.tsx` | "Report a fault" → existing fault/quote flow; header call button dials the verified number |
| "24/7 Hotline Service", "24/7 Operations Hub", "24/7 Hotline" office hours | `home.tsx`, `contact.tsx`, `api/seeds/content.ts` | Published hours 07:00–18:00 |
| "ISO 9001 Certified", "ISO 9001 & OHSAS 18001 Certified", header ISO chip, "Verified ISO 9001" | `home.tsx`, `contact.tsx`, `layout.tsx` | Remove; state SANS 10142 / CoC adherence instead |
| "ECA & NSI Accredited", "Master Electricians", team accreditations | `home.tsx`, `team.tsx` | Remove |
| "EST. 2008" hero badge (founding year unverified) | `home.tsx` | Remove unless owner confirms |
| "33kV Substation Panel Testing", "LIVE DISPATCH", turnkey HV substations | `home.tsx`, `marketing.tsx`, `services.tsx` | Hazardous-area testing / inspection / fault-diagnosis copy |
| "Engineer-reviewed quotation within 24 hours", "binding technical proposal" | guest home promo block | Remove block (quote tab remains) |
| Quote turnaround labels ("< 4 Hours", "Immediate") and "Standard (24h)" / "24/7 Critical" | `quote.tsx`, `contact.tsx` | No turnaround; urgency labels Standard / Priority / Urgent fault (enum values unchanged) |
| Department SLAs ("1-Hour Priority Callback", "Immediate Rapid Dispatch"), invented offices, managers and numbers | `api/seeds/content.ts` | Verified contacts only |
| FAQ promises ("within 4 business hours", "immediate engineer dispatch", "24–48 hours") | `api/seeds/content.ts` | Neutral wording, no deadlines |

Enum values (`JOB_URGENCIES = STANDARD | HIGH | EMERGENCY`, `ServiceCategory` incl. `CABLING`, `SUBSTATIONS`)
are **not** removed: existing jobs, quotes and AI cases reference them. Only customer-facing labels change.

## 3. Screenshot → code mapping

| Screenshot | Requirement | Files | Commit(s) |
| --- | --- | --- | --- |
| `IMG-20261022-WA0003.jpg` | Official logo everywhere; phone icon dials verified number | `components/layout.tsx`, `AuthShell.tsx`, `BootSplash.tsx`, `app/welcome.tsx`, `marketing.tsx`, app icon/splash, `utils/links.ts`, seeds | 05–08 |
| `IMG-20261021-WA0010.jpg` | Replace turnkey/HV/24-7 hero copy; remove "24/7 Emergency" CTA; keep fault/contact action | `(public)/(tabs)/home.tsx`, `components/marketing.tsx` | 12–13 |
| `IMG-20261021-WA0009.jpg` | Remove quote-within-24h promo block, extra tiles and account promo; keep Quote/Contact entry points | `(public)/(tabs)/home.tsx`, `components/marketing.tsx` | 14 |
| `IMG-20261021-WA0012.jpg` | Drop HVAC wording; remove Fibre & Data Cabling sector | `(public)/(tabs)/quote.tsx`, `contact.tsx` | 21 |
| `IMG-20261021-WA0011.jpg` | Neutral urgency labels; hide kVA from standard path; keep date | `(public)/(tabs)/quote.tsx` | 22 |
| Portfolio slides | Genuine branding, services, sectors, quality statement | public screens, `api/seeds/content.ts` | 05, 11 |

**Quote form after Part 3:** step 1 asks *What do you need?* (New installation · Fault or repair · DB board ·
Compliance (CoC) · Solar & backup · Maintenance) plus an optional site type (Residential / Commercial /
Industrial — commercial kept, without HVAC). Step 2 keeps service, scope brief, urgency (Standard / Priority /
Urgent fault → STANDARD / HIGH / EMERGENCY), preferred date and photos; supply type and kVA moved into
*Advanced details (optional)*, which opens automatically when the load estimator passes a kVA value. Legacy
sector keys (INDUSTRIAL, COMMERCIAL, FIBRE, AUDIT, EMERGENCY) from deep links and saved drafts are mapped, and
enquiries stored with old sector/voltage text still display unchanged.

**Ambiguity noted:** "the last screenshot we don't need within the quotation section at all" is read as the
technical scope fields on WA0011 (kVA, HV voltage options) and the circled Fibre sector — not the whole quote
tool. Required inputs (service, scope brief, location, contact, consent) and the preferred date stay.

## 4. Screen and route inventory (baseline)

Every file route below must remain reachable after Part 3; `src/__tests__/part3-baseline.test.tsx` fails if
any is removed. Additions are allowed.

| Role | Primary tabs (before) | Secondary screens |
| --- | --- | --- |
| Guest | Home · Services · Work · Quote · Contact | `faq`, `partners`, `privacy`, `team`, `why-psg`, `project/[id]`, `service/[id]`, `welcome`, `login`, `register`, `forgot-password`, `reset-password` |
| Customer | Dashboard · Jobs · Rewards · Billing · Profile | `request`, `job/[id]`, `quote/[id]`, `invoice/[id]`, `report/[id]`, `qr/[id]`, `ai`, `ai/new`, `ai/[id]`, `notifications`, `onboarding` |
| Employee | Today · Calendar · Scan · Timesheet · Profile | `jobs`, `job/[id]`, `inspection/[id]`, `materials/[id]`, `report/[id]`, `leave`, `notifications` |
| Admin (office) | Dashboard · Enquiries · Jobs · Workforce · More | about 40 stack screens reached from More (AI review/knowledge/analytics, new job, schedule, inventory, missed calls, invoices, payroll, discounts, compliance, customers, services, settings, notifications, profile, detail screens) |
| Owner (superset) | as Admin | owner-only: `staff`, `reports`, `exports`, `audit`, `data-requests`, `ai-settings`; owner-only actions inside `payroll` (approve/finalise) and `settings` (edit) |

**Owner protection today:** the mobile `OwnerGate` and the More-menu filter hide owner modules from office
admins. The API enforces `ADMIN_OWNER` on the matching endpoints (covered in `apps/api/tests/security.test.ts`).
Commit 20 closed the gap where `OWNER_ONLY_PATHS` omitted `/admin/ai-settings`. The list is now the single
source of truth: the admin stack (`Stack.Protected`) refuses those routes for office admins, the Manage
menu derives its owner-only items from it, and each owner screen still renders `OwnerGate`.

### Navigation after Part 3

| Role | Tab bar | Secondary area |
| --- | --- | --- |
| Guest | Home · Services · Work · Quote · Contact | Footer: Why PSG, Our team, Partners, FAQ, Privacy; header account menu |
| Customer | Home · My jobs · **Request** (action) · Billing · Account | Account: Rewards, Notifications, Compliance certificates, Smart Quote assessments, About PSG |
| Employee | Today · Calendar · Scan · Timesheet · More | More → My work: All assigned jobs, Log materials, Inspection / CoC, Leave, Notifications |
| Admin / owner | Dashboard · Enquiries · Jobs · Workforce · Manage | Manage: grouped modules with search; owner-only modules only for the owner |

## 5. Acceptance checklist

Status key: **✔** done and covered by automated tests · **◑** done, automated tests only — not yet verified by hand on a
physical device · evidence names the test file(s) under `apps/mobile/src/__tests__/` or `apps/api/tests/`.

| Criterion | Status | Evidence |
| --- | --- | --- |
| Login photograph removed; official logo, usable form, guest / register / sign-in and reset paths work | ✔ | `auth-landing`, `runtime-navigation`, `branding` |
| Blue lightning logo replaced wherever it stands for PSG | ✔ (vector redraw — Q6) | `branding` |
| Call action opens the dialer with the verified number; web has a fallback | ◑ | `contact-dialer` (Linking stubbed; no real call placed) |
| Home “Turnkey high-voltage … 24/7” paragraph replaced by hazardous-area testing copy | ✔ | `guest-home` |
| No 24/7, immediate-dispatch, 24-hour quote or unsupported certification claims in customer-facing copy | ✔ app and seed (see limitations) | `public-claims`, `guest-home`, `quote-scope`, API `content` |
| Highlighted Home promotional block and tiles removed; Quote / Contact entry points remain | ✔ | `guest-home` |
| Quote picker without Fiber & Data Cabling; commercial wording without HVAC | ✔ | `quote-sectors` |
| Urgency labels make no 24h / 24/7 claim and still map to `STANDARD \| HIGH \| EMERGENCY` | ✔ | `quote-scope`, `quote-workflow`, API `quote-compat` |
| Technical quote fields reduced; validation, submission and old records still work | ✔ | `guest-quote`, `quote-scope`, `quote-sectors`, API `quote-compat` |
| Every role more navigable; every original route still reachable | ✔ | `part3-baseline` (88 routes), `customer-navigation`, `staff-navigation`, `guest-navigation`, `check:routes` |
| Narrow phones: header / tabs without clipped name or overlap | ◑ | `header-account`, `responsive-a11y`; 320 px web screenshots |
| Customer quote / job / payment / rewards flows still work | ◑ | `customer-flows`, `customer-navigation`, `quote-workflow`, API suite |
| Employee jobs, check-in, tracking, timesheets and materials still work | ◑ | `employee-workflow`, `arrival-qr`, `scan-states`, API `workflow` |
| Admin office features and owner-only permissions; admin cannot reach owner-only data | ✔ | `owner-guards`, `admin-operations`, `navigation-guards`, API `security` |
| Existing tests and builds pass, results recorded honestly | ✔ | Section 8 |

## 6. Progress log

| # | Commit | Status | Checks |
| --- | --- | --- | --- |
| 01 | docs: add Part 3 client feedback and acceptance criteria | done | docs only |
| 02 | test: add baseline navigation and role access checks | done | |
| 03 | style: refine shared spacing and typography tokens | done | |
| 04 | style: polish shared cards buttons and form controls | done | |
| 05 | assets: add PSG logo redraw and app icons | done | |
| 06 | feat: replace PSG brand marks across shared UI | done | |
| 07 | fix: make header call action open phone dialer | done | |
| 08 | fix: improve compact mobile header responsiveness | done | |
| 09 | style: redesign sign in and welcome experience | done | |
| 10 | test: cover auth and guest landing routes | done | |
| 11 | content: align PSG service copy with official website | done | |
| 12 | content: replace unsupported emergency availability claims | done | |
| 13 | content: update hero with hazardous area testing focus | done | |
| 14 | refactor: remove redundant guest home promotions | done | |
| 15 | style: simplify guest navigation and service discovery | done | |
| 16 | style: streamline customer dashboard navigation | done | |
| 17 | style: clarify customer job quote and billing pathways | done | |
| 18 | style: streamline employee daily work navigation | done | |
| 19 | style: simplify admin dashboard and management menus | done | |
| 20 | fix: preserve owner-only navigation and access guards | done | |
| 21 | content: correct quotation sector descriptions and options | done | |
| 22 | refactor: simplify quotation scope and urgency labels | done | |
| 23 | test: protect quotation and role workflow regressions | done | |
| 23b | test: report API test failures through the exit code *(optional, outside the client brief)* | done | |
| 24 | fix: polish responsive screens and accessibility | done | |
| 25 | docs: record Part 3 validation and final walkthrough | done | |


Commit hashes are listed in the final report for the branch (they are created after this file is written).

**Logo source:** `apps/mobile/assets/images/brand/psg-logo.svg` is a vector redraw of the portfolio house
mark (blue → violet → pink), traced from `Screenshot 2026-11-01 203150.png` because no original artwork was
supplied. The app icon, Android adaptive icon layers, splash and favicon are rendered from it. Swap in the
owner's original file when received (Q6); `components/BrandLogo.tsx` mirrors the same paths.

**References (commit 25):** the README reference list now includes react-native-svg (used by `BrandLogo.tsx` and
`BrandBackdrop.tsx`) and the PSG website and company portfolio used as content sources.

**Existing databases (commit 12):** the seed only fills an empty database, so a database created before
Part 3 still holds the old marketing rows. `npm run db:content:refresh -w @hydra/api` shows a dry run of
what would change (service wording by slug, company content, offices, department desks, FAQs);
`-- --apply` applies it in one transaction. Jobs, quotes, invoices, users and service ids/prices are not
touched. Production additionally needs `--allow-production` and should only be run with the owner's
approval. Independently of the database, the app no longer shows records flagged `is_demo` (portfolio,
team, partners) or demo company content (metrics, accreditations, testimonials) as real.

The README's Generative AI declaration will be updated in commit 25 to record Claude Code assistance for
Part 3; it is not removed or shortened.

## 7. Change matrix

| Client issue (screenshot) | Files changed | Behaviour after Part 3 | Test evidence |
| --- | --- | --- | --- |
| Logo (WA0003) | `components/BrandLogo.tsx`, `layout.tsx`, `AuthShell.tsx`, `BootSplash.tsx`, `app/welcome.tsx`, `assets/images/*` | PSG gradient house mark in header, sign-in, splash, welcome, app icon | `branding` |
| Phone icon (WA0003) | `content/company.ts`, `utils/links.ts`, `components/layout.tsx` | Dials 082 603 9283; validates; web also shows the number | `contact-dialer` |
| Header Emergency / ISO / PRO (WA0003, WA0010) | `components/layout.tsx` | Logo + full name + call + account; no 24/7 or ISO claim | `header-account`, `responsive-a11y` |
| Hero paragraph & 24/7 Emergency (WA0010) | `(tabs)/home.tsx`, `content/marketing.ts` | Hazardous-area testing copy; Request a quote / Report a fault / Call PSG; safety note | `guest-home` |
| Quote-within-24h promo, tiles, account promo (WA0009) | `(tabs)/home.tsx`, `components/marketing.tsx` | Removed; About links in footer | `guest-home` |
| HVAC & Fiber sector (WA0012) | `features/quoteSectors.ts`, `(tabs)/quote.tsx`, `(tabs)/contact.tsx` | Website intake categories + optional site type; legacy keys mapped | `quote-sectors`, API `quote-compat` |
| Scope step (WA0011) | `(tabs)/quote.tsx`, `utils/format.ts`, request / AI / new-job forms, job & enquiry screens | Standard / Priority / Urgent fault; kVA & supply in Advanced; no turnaround | `quote-scope`, `quote-workflow` |
| Unsupported claims (brief §2, §6) | `api/seeds/content.ts`, `api/src/ai/policies.ts`, `orchestrator.ts`, public screens | Verified contacts and portfolio copy; demo records hidden; refresh script for existing databases | `public-claims`, API `content` |
| Navigation for every role (brief §5) | tab layouts, dashboards, Account / More / Manage, `TabBar.tsx`, `admin/_layout.tsx`, `guards.ts` | See “Navigation after Part 3” (section 4) | `customer-navigation`, `staff-navigation`, `owner-guards`, `part3-baseline` |
| Login / welcome (brief §4) | `app/welcome.tsx`, `AuthShell.tsx`, `(auth)/login.tsx`, `BrandBackdrop.tsx` | Photo-free; logo → welcome → sign in → create / guest | `auth-landing` |

## 8. Validation record (1 November 2026, `feature/part3-client-changes`)

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| Shared tests (Vitest) | 17 / 17 |
| API tests (Vitest + real PostgreSQL) | 252 / 252 (245 existing + 7 new). Run with `TEST_PG_DIR=.pgdata-test2 TEST_PG_PORT=5444` because an orphaned test cluster from an earlier interrupted run held the default port/directory. |
| Mobile tests (Jest + RNTL) | 338 / 338 in 32 suites (221 before Part 3). One pre-existing `act()` warning in `scan-states` also occurs on `main`. |
| `npm run check:routes -w @hydra/mobile` | 229 navigation targets → 88 routes (all 88 pre-Part 3 routes still exist; fewer targets because duplicate link grids were removed) |
| Build (`expo export`, Android + iOS; web export) | Pass |
| `npx expo-doctor` | 20 / 21. The failing check reports 11 Expo SDK 57 packages behind the latest patch release; Part 3 changed no dependencies (upgrades are out of scope). |
| Visual check | Headless Edge screenshots of welcome, sign-in, register, home, services, work, quote, contact and Why PSG at 320 px and ~500 px width |

**Found during validation:** the API test command exited 0 even when tests failed (embedded-postgres's exit hook
replaced Vitest's exit code — present on `main` too). Optional commit 23b fixes it in `apps/api/tests/globalSetup.ts`;
after it, a deliberately failing test exits 1 and the passing suite exits 0.

**Not verified (needs a device / environment):** real phone dialling on Android; signed-in screens on a device
against a running API with test accounts; GPS / camera / QR on hardware; push notifications; payments. These are
covered by automated tests with stubs only. Use `docs/MANUAL_TEST_MATRIX.md` for the walkthrough.

## 9. Known limitations and follow-ups

- Still open with the owner: approval of the recreated logo (Q6), the website address (Q7), seeded service
  prices (Q10) and AI response windows for levels 1–2 (Q11). The portfolio repeats the African Logistics
  Services description for UKZN, so UKZN is described with the portfolio’s institutional-sector wording until
  the owner supplies its own.
- The recreated lockup’s tagline is small on 320 px phones (about 6–7 px high); a higher-resolution or
  vector original would help. Client logos are cropped from the portfolio slide (about 74 px) and shown at
  44 pt; originals would render more sharply.
- Databases created before Part 3 keep their old marketing rows until `npm run db:content:refresh -w @hydra/api
  -- --apply` is run (owner approval needed for production). That refresh also applies the owner-confirmed company
  details and FAQs (including the invoice PDF header, which reads them from the database). Service wording can
  also be edited in Admin → Service types.

## 10. Owner-confirmed follow-up (2 November 2026)

Applied as new commits after the 26 Part 3 commits (none of which were rewritten):

| Change | Files | Tests |
| --- | --- | --- |
| Confirmed contact details in all four interfaces: both numbers (Ricky, Keoran) and both emails with working `tel:` / `mailto:`; WhatsApp to `wa.me/27826039283`; Monday–Friday 07:00–18:00; no office or department listings; electricians’ “call the office” and customer / electrician links to Contact | `content/company.ts`, `(tabs)/contact.tsx`, `employee/(tabs)/scan.tsx`, customer Account, employee More, footer / home hours | `owner-contact` |
| Owner-supplied recreated logo lockup on welcome and loading screens | `assets/images/brand/psg-logo-lockup.png`, `components/LogoLockup.tsx`, `app/welcome.tsx`, `BootSplash.tsx` | `branding`, `auth-landing` |
| 25+ years, portfolio clients with logos, 12-month workmanship warranty | `content/marketing.ts`, `components/marketing.tsx`, Home, Work, Why PSG, Team, Quote, admin quote default terms, `assets/images/clients/*` | `owner-facts`, `guest-navigation` |
| Seeded company details, FAQs (hours, emails, warranty) and AI office hours | `api/seeds/content.ts`, `api/src/ai/policies.ts` | API `content` |

Validation (2 November 2026): lint and typecheck pass; tests shared 17 · API 254 · mobile 356 (34 suites), all
passing, with no `act()` warnings; route audit 232 navigation targets → 88 routes; Android/iOS and web exports
pass; Contact, Welcome, Home, Work, Why PSG and Quote checked visually at 320 px.

**CI follow-up (2 November 2026):** the pull request's mobile job failed at `npx expo-doctor` (“Check that
packages match versions required by installed Expo SDK”: 11 patch-version mismatches). Expo had published newer
SDK 57 patch releases since `main` last passed on 5 October, so the check had become time-dependent; Part 3 had not
changed any dependency. The fix sets `apps/mobile/package.json` to the expected versions (`expo` ~57.0.31,
`expo-router` ~57.0.29, `@expo/ui`, `expo-constants`, `expo-dev-client`, `expo-linking`, `expo-location`,
`expo-notifications`, `expo-sharing`, `expo-splash-screen`, `jest-expo`) and updates `package-lock.json`
(Expo packages and their sub-dependencies only). Verified with a clean `npm ci` replica of the CI job: Jest 356,
route audit, Expo config checks, expo-doctor 21/21, Android/iOS and web exports; lint, typecheck, shared 17 and
API 254 also pass.
