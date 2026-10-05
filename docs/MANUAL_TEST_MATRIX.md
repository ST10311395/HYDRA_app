# HYDRA — Manual Test Matrix (physical phone)

Use with README → *Testing on a physical phone*. Accounts: README → *Manual testing every role*.
“Auto” names the automated test that covers the same path; manual runs on a real device are still
needed for camera, GPS, wake lock over http, native share sheets and OEM browser behaviour.

**Retest first on the next walkthrough** (fixed in the 2026-10-02 runtime review):

1. Customer → Show QR → back → Show QR → back (repeat quickly): no error overlay; the QR countdown runs.
2. Profile edit for each role: change name/phone (customer: address + marketing), Save → header initials
   change → leave and return → sign out and in → values persist. Cancel discards typing.
3. Guest Quote → step 3 → tap and long-press Phone / Email / WhatsApp: only the selection changes.
4. Double-tap Submit on Quote, Request service, Contact, Leave, Clock in: one record each.
5. Employee Scan in the phone browser over http: “Camera scanning isn’t available here” (not a black box);
   in the app: deny camera once, then permanently; expired / already-used code messages.
6. Employee Today with no jobs today but future assignments: “View assigned jobs (N)”.
7. Admin Payroll for a period without confirmed timesheets: explanation instead of bare R0.00.
8. Turn on flight mode on an admin list: “You’re offline”, not an empty list or grey cards.
9. Customer invoice: “Development mode … No real money moves” before paying.

## Guest

| Step | Expected | Auto |
| --- | --- | --- |
| Launch → Welcome → Continue as guest | Public Home; remembered next launch | runtime-navigation |
| Home / Services / Work / Quote / Contact tabs, search & filters | Content loads; chips scroll horizontally without page scroll | components |
| Quote wizard Sector → Scope → Location → Submit | Progress 25/50/75/100 %, Back/Next keep values, validation per step, reference shown, lead (not a job) | guest-quote |
| Preferred contact method | Selection only — no WhatsApp/share sheet | guest-quote |
| Contact Us form | Reference shown; failure keeps typed text | guest-quote (enquiry), resilience (API dedupe) |
| Call / Emergency / WhatsApp / Directions | Opens dialer / WhatsApp / maps for that office; message if unavailable | guest-quote (builders) |
| Account icon → Sign in / Create account | Opens the auth screens | header-account |

## Customer

| Step | Expected | Auto |
| --- | --- | --- |
| Sign in → dashboard | “Hello, {name}”, rewards, active job | runtime-navigation |
| Request service + photos (camera, gallery, cancel, deny, failed upload → Retry) | One job; photos attached; form kept | customer-flows, runtime-states |
| Jobs, quote accept/decline, timeline | Steps only complete as the job advances; declined quote marked DECLINED | customer-flows, resilience |
| Arrival QR in/out, refresh | No crash; code rotates; stops when left | arrival-qr |
| Invoices, PDF, full/partial payment, cancel | Test-mode notice; status updates; no `/payments/null` | admin-operations |
| Rewards, compliance report, notifications | Load or explicit empty/offline state | runtime-states |
| Profile edit/save/persist, password, data request | See retest 2; password needs confirmation | profile-editing, profile (API) |
| Sign out | Welcome; old role navigation gone | runtime-navigation |

## Employee

| Step | Expected | Auto |
| --- | --- | --- |
| Staff number sign-in → Today | Next job with date; clear empty state | runtime-states |
| Clock in / out, reopen app while on shift | “Shift in progress since …”; one open shift | resilience, runtime-states |
| Scan QR (granted / denied / blocked / unsupported / expired / wrong job / already in) | Explicit screen for each | scan-states, employee-workflow |
| Materials, milestones, inspection | Only on-site milestones are manual | employee-workflow, resilience |
| Timesheet, calendar, leave (date order, double tap) | One request; end before start rejected | resilience |
| Profile edit/save/persist | See retest 2 | profile-editing |

## Office admin / Owner

| Step | Expected | Auto |
| --- | --- | --- |
| Dashboard, enquiries (call, email, in progress, close, convert once) | One job per enquiry; reference kept | resilience |
| Jobs, quote builder, assignment, invoices, payments | As before | admin-operations |
| Workforce: team, leave, timesheets, schedule; payroll | Zero-total explanation; period boundaries respected | runtime-states, resilience |
| Inventory, compliance, missed calls, discounts, services, settings, notifications | Loading → data / empty / offline / no access / error | runtime-states |
| Owner-only (reports, exports, audit, staff, data requests, payroll approval) | Office admin: “Owner / manager access only” and API 403 even by typed URL; owner allowed | runtime-navigation, resilience |
| Profile edit/save/persist (office and owner) | See retest 2 | profile-editing, profile (API) |

## HYDRA Smart Quote (AI) — full demo script in [AI_ASSISTANT.md §17](AI_ASSISTANT.md#17-manual-demo)

| Step | Expected | Auto |
| --- | --- | --- |
| Customer dashboard → Smart Quote → start; camera + gallery photo; remove; retry a failed upload | Photo strip works; “Development AI simulation” label visible | smart-quote |
| “My DB trips whenever I turn my geyser on.” → reply to the questions | ≤ 3 questions per round; assessment card: fault finding, 3/5 High, ~24 h target “subject to technician availability”, range, confidence, notices | ai (API), smart-quote |
| Accept (address + confirmation), double tap | One REQUESTED job with the photo; admin notified “Customer accepted AI preliminary proposal” | ai (API) |
| “There is smoke coming from the DB” | Safety warning, no price, admin CRITICAL alert, case at the top of AI Review | ai (API), smart-quote |
| Request a person / decline / add more information | Pending-review banner / closed / reply composer | smart-quote |
| Admin AI Review: open, edit severity + price (reason), send proposal, reply | Customer sees “PSG Electrical team response” + proposal adjusted notification | ai (API), smart-quote |
| Learning: unknown case → resolve → approve knowledge → similar case | Second case retrieves the entry (shown in the case audit, “used n×”) | ai (API) |
| Office admin opens Settings → AI Assistant | “Owner / manager access only”; API 403 | ai (API), smart-quote |
| Owner switches Smart Quote off | Customer sees the unavailable state; the rest of HYDRA works | ai (API), smart-quote |

