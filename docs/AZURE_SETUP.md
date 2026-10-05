# Azure setup (one-time)

This creates the production (and, repeated with `-stg` names, the staging) infrastructure described in
[ARCHITECTURE.md](ARCHITECTURE.md). Use **South Africa North** to keep personal information in-country
(POPIA). Commands use the Azure CLI (`az`); the portal works equally well.

```bash
LOC=southafricanorth
RG=rg-hydra-prod
az group create -n $RG -l $LOC
```

## 1. PostgreSQL Flexible Server

```bash
az postgres flexible-server create -g $RG -n psql-hydra-prod -l $LOC \
  --tier GeneralPurpose --sku-name Standard_D2ds_v5 --version 17 --storage-size 64 \
  --backup-retention 35 --geo-redundant-backup Disabled --high-availability Disabled \
  --admin-user hydraadmin --admin-password '<generated>' --public-access None
az postgres flexible-server db create -g $RG -s psql-hydra-prod -d hydra
```

- Enforce TLS (`require_secure_transport=ON`, default). The API uses `DATABASE_SSL=true`.
- Networking: prefer VNet integration (App Service ↔ PostgreSQL private access). If you use public access,
  allow only the App Service outbound IPs and, for migrations from GitHub Actions, run the deploy job on a
  self-hosted runner inside the VNet or temporarily allow the runner IP.
- Create a least-privilege application role (owner of the `hydra` database, not the server admin) and use it in
  `DATABASE_URL`: `postgres://hydra_app:<pw>@psql-hydra-prod.postgres.database.azure.com:5432/hydra?sslmode=require`.
- Backups: automated with point-in-time restore (35 days above). Test a restore each quarter.

## 2. Storage account (Blob) — photos, inspection evidence, CoC documents

```bash
az storage account create -g $RG -n sthydraprod -l $LOC --sku Standard_ZRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false --https-only true
az storage container create --account-name sthydraprod -n hydra-private --public-access off --auth-mode login
az storage account show-connection-string -g $RG -n sthydraprod -o tsv   # → Key Vault secret
```

The container is private; the API issues read-only SAS URLs that expire after minutes. The connection string
(needed to sign SAS URLs) is stored only in Key Vault and never sent to the app. Enable soft delete for blobs
(7–30 days) and a lifecycle rule if long-term archive tiers are wanted.

## 3. Key Vault

```bash
az keyvault create -g $RG -n kv-hydra-prod -l $LOC --enable-rbac-authorization true
for s in DATABASE-URL JWT-ACCESS-SECRET JWT-REFRESH-SECRET FILE-URL-SIGNING-SECRET PAYMENT-SECRET-KEY \
         AZURE-STORAGE-CONNECTION-STRING SMS-API-KEY WHATSAPP-API-KEY EMAIL-API-KEY EXPO-ACCESS-TOKEN; do
  az keyvault secret set --vault-name kv-hydra-prod -n $s --value '<value>'
done
```

Generate JWT/file-signing secrets with
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` (access and refresh must differ).

## 4. App Service (API)

```bash
az appservice plan create -g $RG -n asp-hydra-prod -l $LOC --is-linux --sku P1v3
az webapp create -g $RG -p asp-hydra-prod -n app-hydra-api-prod --runtime "NODE:24-lts"
az webapp identity assign -g $RG -n app-hydra-api-prod            # system-assigned managed identity
# allow the identity to read secrets:
az role assignment create --role "Key Vault Secrets User" --assignee <principalId> \
  --scope $(az keyvault show -n kv-hydra-prod --query id -o tsv)
az webapp config set -g $RG -n app-hydra-api-prod --startup-file "node dist/server.js" --always-on true \
  --http20-enabled true --min-tls-version 1.2 --ftps-state Disabled
az webapp update -g $RG -n app-hydra-api-prod --https-only true
az webapp deployment slot create -g $RG -n app-hydra-api-prod --slot staging   # optional blue/green
```

App settings (Key Vault references use `@Microsoft.KeyVault(SecretUri=…)`):

| Setting | Value |
| --- | --- |
| `NODE_ENV` / `APP_ENV` | `production` / `production` |
| `PUBLIC_API_BASE_URL` | `https://api.hydra.psgelectrical.co.za` |
| `TRUST_PROXY` | `true` |
| `CORS_ORIGINS` | web origins only if a web client is added (the native app sends no Origin) |
| `DATABASE_URL`, `DATABASE_SSL` | KV reference, `true` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FILE_URL_SIGNING_SECRET` | KV references |
| `STORAGE_PROVIDER`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` | `azure`, KV ref, `hydra-private` |
| `PAYMENT_PROVIDER`, `PAYMENT_SECRET_KEY`, `PAYMENT_PUBLIC_KEY`, `PAYMENT_CALLBACK_URL` | `paystack`, KV ref, `pk_live_…`, `hydra://payments/complete` |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_FROM_NUMBER` (+ WhatsApp equivalents) | `twilio`, KV ref, `+27…` |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | `smtp`, KV ref (SMTP URL), sender |
| `PUSH_NOTIFICATION_CONFIG`, `EXPO_ACCESS_TOKEN` | `expo`, KV ref |
| `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | from Google Cloud (not secrets) |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_ASSISTANT_ENABLED`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | e.g. `gemini`, KV ref, `gemini-3.6-flash`, `true`, `25000`, `1` (see [AI_ASSISTANT.md](AI_ASSISTANT.md)) |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` — the workflow uploads a pre-built package with production `node_modules` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | from step 5 |
| `DISABLE_SCHEDULER` | `true` if the WebJob in step 6 runs the scheduled tasks (avoid double runs when scaled out) |

The API refuses to start in production if a required secret is missing, TLS is off, or a development
fallback (simulated payments, console email) is configured.

Custom domain + managed certificate: `az webapp config hostname add …` then
`az webapp config ssl create --hostname api.hydra.psgelectrical.co.za …` and bind it (SNI).

## 5. Monitoring

```bash
az monitor app-insights component create -g $RG -a appi-hydra-prod -l $LOC --kind web
```

Set `APPLICATIONINSIGHTS_CONNECTION_STRING`; enable App Service log streaming to a Log Analytics workspace.
Alert on: HTTP 5xx rate, `/health` availability test, PostgreSQL CPU/storage/connection count, failed
webhook signature spikes (`Invalid webhook signature` log messages) and repeated `UNAUTHORIZED` bursts.

## 6. Scheduled jobs

Run the compiled worker (`node dist/jobs/worker.js`; `npm run jobs` locally) as a continuous WebJob or an Azure
Functions timer, and set `DISABLE_SCHEDULER=true` on the API so scaled-out instances do not run tasks twice.

## 7. Front Door (optional)

Azure Front Door Standard in front of App Service adds WAF rules and a global edge. Restrict App Service
access to the Front Door service tag and keep `TRUST_PROXY=true`. WebSockets (Socket.IO) are supported.

## 8. GitHub deployment credentials (publish profile)

The deploy workflow authenticates with the App Service **publish profile**. The production web app is
`hydra-psg-api` (`https://hydra-psg-api-dqezcvhufjacdhfr.southafricanorth-01.azurewebsites.net`).

1. Enable basic-auth publishing credentials on the web app (portal → *Configuration → General settings →
   SCM Basic Auth Publishing Credentials: On*), otherwise the publish profile is rejected.
2. Download the profile (portal → App Service → *Download publish profile*, or
   `az webapp deployment list-publishing-profiles -g <resource-group> -n hydra-psg-api --xml`) and store the
   whole XML as the `production` environment secret `AZURE_WEBAPP_PUBLISH_PROFILE`. Do not save it in the repo.
3. Add the environment secret `DATABASE_URL` and variables `AZURE_WEBAPP_NAME=hydra-psg-api`,
   `AZURE_WEBAPP_SLOT=production`, `API_BASE_URL=https://hydra-psg-api-dqezcvhufjacdhfr.southafricanorth-01.azurewebsites.net`.

Rotate the credential with *Reset publish profile* and update the secret. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Code attribution

- Microsoft. 2026. *Azure App Service documentation*. Available at: https://learn.microsoft.com/en-us/azure/app-service/ [Accessed 5 October 2026].
- Microsoft. 2026. *Azure Database for PostgreSQL documentation*. Available at: https://learn.microsoft.com/en-us/azure/postgresql/ [Accessed 1 October 2026].
- Microsoft. 2026. *Azure Blob Storage documentation*. Available at: https://learn.microsoft.com/en-us/azure/storage/blobs/ [Accessed 20 August 2026].
- Microsoft. 2026. *Azure Key Vault documentation*. Available at: https://learn.microsoft.com/en-us/azure/key-vault/ [Accessed 5 October 2026].

Full reference list: [README.md](../README.md#code-attribution-and-references).
