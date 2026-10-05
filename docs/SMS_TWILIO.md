# SMS / WhatsApp setup (Twilio)

Outgoing messages for the missed-call workflow (automatic replies and office-approved replies) are sent
through Twilio Programmable Messaging (`apps/api/src/integrations/messaging.ts`). Every attempt is recorded
in `ai_message_logs` with its delivery status. Without credentials the provider is “not configured”:
messages are logged as `NOT_CONFIGURED` and are **never** reported as sent.

## 1. Twilio account

1. Create a Twilio account and upgrade from trial (trial accounts can only message verified numbers).
2. **SMS sender**: buy a number or register an alphanumeric sender ID for South Africa (e.g. `PSGELEC`) —
   alphanumeric senders are one-way, which suits automated notices; use a number if replies are wanted.
3. **WhatsApp (optional)**: *Messaging → Senders → WhatsApp senders* — connect a WhatsApp Business
   profile for the business phone number. Outside the 24-hour customer-service window WhatsApp only allows
   pre-approved templates; submit the auto-reply text as a template before enabling the WhatsApp channel.
4. Copy the **Account SID** and **Auth Token** (or create an API key and use `SID:secret`).

## 2. Configure the API

```
SMS_PROVIDER=twilio
SMS_API_KEY=ACxxxxxxxxxxxxxxxx:your_auth_token      # ACCOUNT_SID:AUTH_TOKEN — Key Vault in Azure
SMS_FROM_NUMBER=+27xxxxxxxxx                          # or the alphanumeric sender ID
WHATSAPP_PROVIDER=twilio                              # optional
WHATSAPP_API_KEY=ACxxxxxxxxxxxxxxxx:your_auth_token
WHATSAPP_FROM_NUMBER=+27xxxxxxxxx                     # sent as whatsapp:+27…
```

Restart the API; **More → Settings** shows SMS/WhatsApp as LIVE, and **More → Missed calls** shows the
provider status.

## 3. Enable the workflow

1. Owner: **More → Settings → Missed-call automation**: review the auto-reply template (`{{name}}` is the
   caller's first name), pick the default channel, then enable the feature flag.
2. Only known customers get an automatic reply (callers with an open job receive a live job-status message);
   unknown numbers are queued for **human review** with a suggested reply.
3. Test with a manual entry (**Missed calls → Log a missed call manually**) using a staff phone number that
   exists as a customer, and confirm the message log shows `SENT` with a Twilio message SID.

## Compliance

- Messages are transactional follow-ups to a call the person made; do not add marketing content (POPIA
  direct-marketing rules require opt-in).
- Phone numbers are masked in logs and audit metadata; provider payloads are not logged.
- Costs: monitor Twilio usage alerts; failed sends are marked `FAILED` with the provider error and raise an
  admin notification (`MESSAGE_FAILED`).
