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

Sources: PSG website (<https://psg-electrical-site.axiomcompute.workers.dev/>) and the owner's company
portfolio (`part3-reference/Screenshot 2026-11-01 2031*.png`).

| Fact | Value used in the app | Source |
| --- | --- | --- |
| Trading name | PSG Electrical & Cables (solar division: Trite Solar) | Website, portfolio |
| Strapline | Innovation-driven electrical solutions | Website, portfolio cover |
| Primary phone | 082 603 9283 | Website; portfolio lists it as Ricky |
| Second phone | 072 752 0848 | Website; portfolio lists it as Keoran |
| Published hours | 07:00–18:00 (no response-time promise) | Website |
| Services | Electrical installations · Fault finding · Distribution boards · Compliance (CoC, SANS 10142-1) · Maintenance & repairs · Solar & backup power | Website |
| Capability areas | Industrial installations and upgrades · cable management · DB installation/reconfiguration · fault finding and diagnostics · maintenance in operational environments · solar integration support · hazardous-area compliance and installations | Portfolio |
| Sectors | Industrial & manufacturing · retail & commercial · logistics & warehousing · institutional facilities · chemical & hazardous environments | Portfolio |
| Quality statement | Work adheres to SANS 10142 wiring standards, CoC requirements and industry best practice; priorities are safety, compliance and long-term reliability | Portfolio |
| Quote intake categories | New installation · Fault or repair · DB board · Compliance (CoC) · Solar & backup · Maintenance | Website |

### Needs owner confirmation (do not state until confirmed)

| # | Question | Current handling |
| --- | --- | --- |
| Q1 | **Email addresses conflict.** Website: `keoran@psgelectrical.co.za`, `keoran@tritesolar.co.za`. Portfolio: `info@psgelectrical.co.za`, `trite@polka.co.za`. Which are current? | Use the website addresses (newer, client-specified source of public contact data); flag here. |
| Q2 | Which number is the primary business line, and may personal names (Ricky / Keoran) be shown? | 082 603 9283 primary, as the brief specifies; numbers labelled without personal names. |
| Q3 | Days of operation for the 07:00–18:00 hours. | Show the hours only, no weekdays. |
| Q4 | "25+ years" industry experience. | Not displayed prominently until confirmed. |
| Q5 | Permission to show portfolio client names/logos (African Logistics Services, Swift Chemicals, Fashion Fusion, Hi-Tap Bolt & Tool, UKZN). | Not shown as named projects until permission is confirmed. |
| Q6 | Original logo artwork (SVG or high-resolution transparent PNG). | Needed for commit 05; a screenshot crop is not production quality. |
| Q7 | Website address: portfolio says `www.psgelectrical.co.za`, live site is the workers.dev URL. | Use the domain only where the brief allows; flag. |
| Q8 | WhatsApp number for the business. | WhatsApp action hidden until a number is configured in public content. |
| Q9 | Office address(es) and department desks to publish. | None shown; the contact screen lists the verified phones, emails and hours. |
| Q10 | Service “starting from” prices (seeded: e.g. DB boards R45 000, fault finding R1 450). | Unchanged (business data); owner to review in Admin → Service types. |
| Q11 | AI triage response windows for levels 1–2 (“3–5 business days”, “1–3 business days”) and working days (Mon–Fri assumed). | Unchanged defaults, editable by the owner in AI settings; only 24-hour/24-7/“immediately” wording removed. |
| Q12 | Default quote terms say “Workmanship guaranteed for 12 months” (Admin → quote builder). | Unchanged: editable business terms, not app marketing; owner to confirm the warranty period. |

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

- Owner confirmations Q1–Q12 (section 1) are outstanding; the app uses the conservative choice for each.
- The logo is a vector redraw from the portfolio slide until the owner supplies original artwork (Q6).
- Databases created before Part 3 keep their old marketing rows until `npm run db:content:refresh -w @hydra/api
  -- --apply` is run (owner approval needed for production); service wording can also be edited in Admin → Service types.
- Admin-editable text (default quote terms, AI policy response windows for levels 1–2) is left for the owner to
  review (Q11, Q12).
