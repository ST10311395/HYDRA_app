# Missed-call workflow (PDF Story 20, spec §11)

Goal: when a customer's call to the office work phone is missed, they receive a prompt, relevant reply and
the office has a reviewable log — without covert data collection.

## Components

| Part | Location |
| --- | --- |
| Android native module (Kotlin) | `apps/mobile/modules/missed-call-monitor` — `MissedCallMonitorModule.kt` reads **only** `CallLog.Calls` rows with `TYPE = MISSED_TYPE` newer than a cursor, projecting number, date and duration. Oldest-first batches of 100; withheld numbers skipped. No contacts, recordings, answered or outgoing calls. |
| Config plugin | `modules/missed-call-monitor/app.plugin.js` adds `READ_CALL_LOG` **only** when `HYDRA_ENABLE_MISSED_CALL_MONITOR=true` (EAS profile `admin-device`). |
| JS bridge | `modules/missed-call-monitor/index.ts` — `isMissedCallMonitorAvailable()`, `requestCallLogPermission()`, `getMissedCallsSince()`; returns “unavailable” on iOS, web, Expo Go and store builds. |
| Sync | `apps/mobile/src/features/missedCallSync.ts` — runs only when the admin taps **Sync**, after consent and OS permission; pages through batches, sends `{ phoneNumber, callAt, durationSeconds, deviceId, source: DEVICE_MONITOR }`, advances a local cursor per call, treats `409` as already logged. |
| Admin UI | **More → Missed calls**: status (feature flag, providers, consent, device), consent disclosure, sync, manual entry, list with filters, message log; detail screen to approve/edit a reply, call back or dismiss. |
| API | `services/missedCallService.ts` — consent + feature-flag checks, caller identification, rule-based classification, send via Twilio, `ai_message_logs`, notifications, audit. |

## Decision rules (human in the loop)

| Caller | Classification | Action |
| --- | --- | --- |
| Customer with an open job | `OPEN_JOB_STATUS` | Automatic reply with the job reference and live status |
| Known customer, no open job | `KNOWN_CUSTOMER` | Automatic reply using the owner-approved template |
| Unknown number | `UNKNOWN_CALLER` | No automatic message — queued as **Needs review** with a suggested reply |

Automatic replies are only sent when the owner has enabled the feature flag (Settings). Delivery results are
stored per message (`SENT`, `FAILED`, `NOT_CONFIGURED`); failures notify admins.

## Privacy and platform constraints

- **Consent**: each admin gives explicit consent on the device before the OS permission prompt; consent can
  be withdrawn in the same screen (recorded in `consents` and the audit log).
- **Least privilege**: the permission exists only in the `admin-device` APK installed on business phones;
  the Play Store build never requests it (checked in CI).
- **No background collection**: nothing runs unless the admin opens the screen and taps Sync.
- **Minimisation**: only number, time and ring duration leave the phone; numbers are masked in logs.
- **iOS**: Apple provides no API for third-party call-log access; the feature is presented as unsupported on
  iPhone and manual logging is offered instead.
- **Google Play policy**: `READ_CALL_LOG` is limited to default phone/SMS handler apps, so the admin build is
  distributed privately (MDM / direct install), not through Play.

## Operating it

1. Configure Twilio ([SMS_TWILIO.md](SMS_TWILIO.md)); owner reviews the template and enables automation.
2. Build and install the `admin-device` APK on the office phone ([EAS_BUILD.md](EAS_BUILD.md)).
3. Sign in as an admin → More → Missed calls → **Set up monitoring on this phone** → read and accept the
   disclosure → allow the Android permission.
4. Tap **Sync missed calls** (e.g. at the start of the day and after lunch). Review items marked
   **Needs review**, edit/approve the reply or call back.
