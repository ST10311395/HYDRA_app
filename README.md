HYDRA
Digital service management for PSG Electrical & Cables and TRITE Solar
HYDRA is a React Native and Expo application backed by a Node.js, Express and PostgreSQL REST API. It brings customer enquiries, electrical and solar service requests, quotations, field work, invoicing and business administration into one system.
Repository: ST10311395/HYDRA_app
This README describes the repository inspected on 5 October 2026. Local demonstration features and deployment configuration are included; configured cloud URLs and integration adapters do not establish that those services are live.
Contents
- Features and user roles
- Technology and architecture
- Project structure
- Local setup
- Testing and quality checks
- HYDRA Smart Quote
- External services and deployment
- Team workflow
- Generative AI declaration
- References
Features and user roles
Role	Main functions
Customer	Register and sign in; request electrical or solar services; track jobs; accept or decline quotations; view invoices and payments; manage notification preferences; use Smart Quote.
Employee	View assigned work; use QR and GPS attendance/check-in features; clock in and out; update work progress; complete jobs and view relevant job information.
Office administrator	Manage customers, service requests, quotations, assignments, invoices, payments, inventory, missed-call follow-up and AI review cases.
Owner	Access administration plus restricted settings, workforce/payroll, reports, audit records and AI policy controls.


Additional workflows include a Certificate of Compliance register, staff records, service types, discounts and customer data requests. API permissions enforce access to records and restricted operations; hiding a screen alone is insufficient protection.
Technology and architecture
Component	Technology and purpose
Mobile application	React Native, React, Expo and Expo Router for screens, navigation and device capabilities (Meta Platforms, Inc., 2026a; 2026b; Expo, 2026).
Backend	Node.js and Express for application services and HTTP endpoints (OpenJS Foundation, 2026).
Shared contracts	TypeScript and Zod for shared types, validation and API contracts (Microsoft, 2026e).
Database	PostgreSQL for persistent business and account data (PostgreSQL Global Development Group, 2026).
Package management	npm workspaces for the shared, API and mobile packages (npm, Inc., 2026).
Quality tools	ESLint, TypeScript, Jest for mobile tests and Vitest for API/shared tests (ESLint, 2026; Microsoft, 2026e; Meta Open Source, 2026).
Version control and automation	Git, GitHub and GitHub Actions (Software Freedom Conservancy, 2026; GitHub, 2026a; 2026b).
Development editor	Visual Studio Code is a suitable editor for the monorepo (Microsoft, 2026f).


The mobile client communicates with the REST API, which validates requests, authorises actions and accesses PostgreSQL and configured service providers. REST architecture is described by Fielding (2000). Separation of interface, service and persistence responsibilities can be evaluated against Martin (2017), while incremental code improvement is discussed by Fowler (2018). These references provide technical context; they do not establish that project code was copied from the sources.
Project structure
HYDRA_app/
├── apps/
│   ├── api/                 # API source, migrations, seeds, scripts and tests
│   └── mobile/              # Expo application, screens and mobile tests
├── packages/
│   └── shared/              # Shared schemas, contracts and utilities
├── scripts/
│   └── configure-lan.mjs    # Local device connectivity configuration
├── docs/
│   ├── AI_ASSISTANT.md      # Smart Quote architecture and demonstration guide
│   └── openapi.json         # API specification
├── .github/workflows/       # CI, EAS build and API deployment workflows
├── .env.example             # Configuration template; contains no real secrets
├── package.json             # Workspace commands
└── README.md
Local setup
1. Prerequisites
Install Git, Node.js and npm. The repository declares Node.js >=20.19; its CI/build configuration uses Node.js 24. Use the version compatible with the checked-in dependencies and lockfile. Use an Android device/emulator or a suitable iOS development environment for native testing.
2. Clone and install
Run these commands in a terminal:
git clone https://github.com/ST10311395/HYDRA_app.git
cd HYDRA_app
npm ci
Installation also builds the shared workspace through the root postinstall script.
3. Configure the environment
Copy the root .env.example to apps/api/.env and apps/mobile/.env. In Windows PowerShell:
Copy-Item .env.example apps/api/.env
Copy-Item .env.example apps/mobile/.env
The API uses server settings in apps/api/.env. The mobile application uses public EXPO_PUBLIC_* settings; place no server secrets in those variables. For a cleaner mobile environment, retain only the relevant public settings in its .env file.
Generate a separate random value for each of JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and FILE_URL_SIGNING_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
Run the command separately for each secret and paste the results into the API environment file. Keep local development settings such as:
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
Complete any remaining required settings using .env.example and the API configuration validator. Real Google authentication and external providers require their own credentials. Never commit populated .env files or real keys.
4. Start and initialise PostgreSQL
From the repository root, start the embedded development database and keep that terminal open:
npm run db:start
In a second terminal at the repository root:
npm run db:migrate
npm run db:seed
npm run db:seed:ai
db:seed supplies demonstration accounts and business data. Set SEED_DEMO_PASSWORD to a local password of at least 12 characters, or use the generated password printed once by the seed script. Example accounts are customer@hydra.demo, sipho@hydra.demo, office@hydra.demo and owner@hydra.demo.
npm run db:reset removes local database data before recreating and seeding it. Use it only when intentionally rebuilding a disposable development database.
5. Start the API and background worker
In a separate terminal:
npm run api
The local API uses port 4000. Its Swagger documentation is available at http://localhost:4000/api/docs; application endpoints use /api/v1.
For scheduled/background processing, run another terminal:
npm run jobs
6. Connect and launch the mobile application
For a physical phone, connect the phone and computer to the same network, then run:
npm run lan
npm run mobile
Follow the Expo terminal instructions. The phone must reach the computer's LAN address; localhost on a phone points to the phone itself. Allow local development traffic through the computer's firewall where needed.
Native integrations such as Google Sign-In require an appropriate development build. Use the repository's EAS development profile or a configured native build environment when Expo Go cannot load a required native module. The development, preview, admin-device and production profiles are defined in apps/mobile/eas.json; cloud profiles require an Expo account and correct project configuration. Replace configured API domains with reachable endpoints before using hosted build profiles.
Testing and quality checks
Run from the repository root:
npm run lint
npm run typecheck
npm test
npm run build
npm run check:routes -w @hydra/mobile
npm run doctor -w @hydra/mobile
The root commands cover all three workspaces. The mobile build exports Android and iOS bundles; it does not by itself produce a signed installable APK or App Store release. Keep the development database available where integration tests require it.
Test coverage includes account/role behaviour, customer requests, quotations, job assignment, attendance, invoicing, administration and Smart Quote. Record actual results from the version being submitted. No new tests were run as part of preparing this README, and no current pass count is asserted here.
Security review should consider request validation, ownership checks, authentication, rate limits, secret management and private file access against OWASP guidance (OWASP Foundation, 2021; 2023). These references are review criteria, not a certification of security compliance.
HYDRA Smart Quote
Smart Quote accepts a customer's problem description and supporting photographs, then produces a preliminary assessment with a service category, severity, indicative price range, response target and follow-up questions. Low-confidence or high-risk cases enter an administrator review queue. Accepted proposals can become service requests.
The implementation combines deterministic safety rules, approved knowledge retrieval, validated provider output and server-side pricing/escalation rules. Approved staff resolutions can expand the knowledge base; this does not retrain model weights. See [the Smart Quote guide](docs/AI_ASSISTANT.md) for architecture, endpoints and demonstration scenarios.
Provider mode	Behaviour
mock	Labelled development simulation; useful without credentials; does not analyse photographs.
none	Human review mode.
anthropic	Configured Anthropic provider adapter; needs a server-side key and compatible model.
openai	Configured OpenAI-compatible adapter; needs a server-side key, model and suitable endpoint.


Provider adapters in the repository do not prove a successful live integration. Confirm the actual environment and provider before demonstrating live AI. Mock responses and development pricing must be identified accurately. Smart Quote provides preliminary service triage, not electrical repair instructions or a final approved quotation.
External services and deployment
Service	Purpose and configuration status
Azure App Service	Intended API hosting target; deployment workflow requires Azure configuration (Microsoft, 2026a).
Azure Blob Storage	Optional private file storage, selected through STORAGE_PROVIDER=azure (Microsoft, 2026b).
Azure Database for PostgreSQL	Intended managed production database; requires provisioned database and secure connection settings (Microsoft, 2026c).
Azure Key Vault	Intended secret-management service; requires provisioned vault and access configuration (Microsoft, 2026d).
Google	Sign-in integration; requires OAuth client IDs and platform configuration.
Paystack	Real payment integration; local demonstration uses simulated payments.
Twilio	Optional SMS/WhatsApp integration; disabled local providers do not send real messages.
SMTP / Expo notifications	Email/push integrations; console email and in-app notifications support local demonstrations.


The repository includes GitHub Actions workflows for CI, EAS builds and manually requested Azure API deployments. Configure GitHub environments, Azure OIDC identity, required secrets/settings and database migrations before deployment. Keep simulated AI/payment modes and console email out of production. Confirm hosting cost and subscription eligibility before provisioning services. No deployed subscription, resource name or public live URL is claimed by this README.
Team workflow
Work on individual feature branches, review changes and merge into main after the team agrees that its work is ready. For example:
git switch -c feature/hydra-your-name
git status
git add README.md
git commit -m "docs: add HYDRA README and AI declaration"
git push -u origin feature/hydra-your-name
If the branch already exists, switch to it without -c. Commit only the intended files and exclude secrets, generated uploads and local database files. Git and GitHub documentation explain the underlying collaboration tools (Software Freedom Conservancy, 2026; GitHub, 2026b).
Generative AI declaration
Scope and tools disclosed
Generative AI assistance is disclosed for HYDRA planning, requirements interpretation, documentation, diagram review, implementation assistance, troubleshooting and verification support. Claude/Claude Code (Anthropic) was used during the project, including development assistance. ChatGPT (OpenAI) was used for guidance, documentation and preparation of this README (OpenAI, 2026).
This declaration covers assistance in producing the assessment and project. The runtime Smart Quote feature described above is a separate application capability; a configured provider does not imply that it was used to author submitted work.
Disclosure record
Item	Disclosure
Assessment sections/work	HYDRA requirements and planning; supporting documentation and diagrams; code implementation/refinement; debugging and checks; README and reference presentation.
Tools	Claude/Claude Code by Anthropic; ChatGPT by OpenAI. Exact model/version information should be taken from the retained interaction records rather than inferred.
Purpose	Brainstorming, interpreting requirements, structuring explanations, implementation assistance, investigating errors, suggesting checks and improving clarity.
Documented dates	The supplied annexure records Claude interactions on 10 August 2026 (Screenshots 1–23) and 17 August 2026 (Screenshots 24–32), with a declaration dated 11 September 2026. This README was prepared with ChatGPT assistance on 5 October 2026. Those annexure dates do not represent the complete development-assistance period.
Existing evidence	HYDRA_AI_Usage_Disclosure_Annexure.pdf contains 32 interaction screenshots. Its summary states that screenshots were supplied because a shareable chat link was unavailable.
Additional evidence required for complete disclosure	Retain relevant Claude Code implementation/debugging records and this ChatGPT interaction with the submission. The annexure's documentation/planning evidence alone does not document every subsequent coding interaction.


Declaration statement
We disclose the use of generative AI as described in this README and the accompanying evidence. AI assistance included implementation support as well as planning and documentation. AI-produced suggestions, explanations and code must be reviewed against the project requirements and checked before they are relied upon or submitted.
The submitting team remains responsible for the final code, accuracy of claims, source attribution, test results and compliance with the assessment's AI-use requirements. This README is an AI-assisted disclosure draft; it does not create signatures or certify that every member has reviewed it. Each member should confirm that the final disclosure reflects their actual use and that relevant evidence is included.
Store the supplied annexure alongside this README if submitting it with the repository. Its original disclosure relates to the interactions it contains; supplement it with later development evidence instead of treating it as a complete coding-use record.
Referencing and code attribution
The references below follow alphabetical author ordering and distinguish same-author, same-year works with letters, as directed by the supplied IIE Harvard Anglia guide. All 23 requested sources are retained, including Fielding (2000). Website years and access dates are the details supplied by the team; they are not independently established publication dates in this README.
Documentation references acknowledge technical resources. A general reference list does not identify which files contain adapted code. Where code is directly copied or adapted, add a precise acknowledgement with the source, affected file/function and nature of the adaptation. AI records should identify the corresponding implementation assistance. Anthropic's product reference is added because Claude is explicitly disclosed.
References
Anthropic 2026. Claude. [Online]. Available at: https://claude.ai/ [Accessed 5 October 2026].
ESLint 2026. ESLint documentation. [Online]. Available at: https://eslint.org/docs/latest/ [Accessed 5 October 2026].
Expo 2026. Expo documentation. [Online]. Available at: https://docs.expo.dev/ [Accessed 5 October 2026].
Fielding, R.T. 2000. Architectural styles and the design of network-based software architectures. Doctoral dissertation. University of California, Irvine.
Fowler, M. 2018. Refactoring: Improving the design of existing code. 2nd ed. Boston: Addison-Wesley.
GitHub 2026a. GitHub Actions documentation. [Online]. Available at: https://docs.github.com/en/actions [Accessed 5 October 2026].
GitHub 2026b. GitHub documentation. [Online]. Available at: https://docs.github.com/ [Accessed 5 October 2026].
Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
Meta Open Source 2026. Jest documentation. [Online]. Available at: https://jestjs.io/docs/getting-started [Accessed 5 October 2026].
Meta Platforms, Inc. 2026a. React documentation. [Online]. Available at: https://react.dev/ [Accessed 5 October 2026].
Meta Platforms, Inc. 2026b. React Native documentation. [Online]. Available at: https://reactnative.dev/docs/getting-started [Accessed 5 October 2026].
Microsoft 2026a. Azure App Service documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/app-service/ [Accessed 5 October 2026].
Microsoft 2026b. Azure Blob Storage documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/storage/blobs/ [Accessed 5 October 2026].
Microsoft 2026c. Azure Database for PostgreSQL documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/postgresql/ [Accessed 5 October 2026].
Microsoft 2026d. Azure Key Vault documentation. [Online]. Available at: https://learn.microsoft.com/en-us/azure/key-vault/ [Accessed 5 October 2026].
Microsoft 2026e. TypeScript documentation. [Online]. Available at: https://www.typescriptlang.org/docs/ [Accessed 5 October 2026].
Microsoft 2026f. Visual Studio Code documentation. [Online]. Available at: https://code.visualstudio.com/docs [Accessed 5 October 2026].
npm, Inc. 2026. npm documentation. [Online]. Available at: https://docs.npmjs.com/ [Accessed 5 October 2026].
OpenAI 2026. ChatGPT. [Online]. Available at: https://chatgpt.com/ [Accessed 5 October 2026].
OpenJS Foundation 2026. Node.js documentation. [Online]. Available at: https://nodejs.org/docs/latest/api/ [Accessed 5 October 2026].
OWASP Foundation 2021. OWASP Top Ten Web Application Security Risks. [Online]. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 October 2026].
OWASP Foundation 2023. OWASP API Security Top 10. [Online]. Available at: https://owasp.org/API-Security/ [Accessed 5 October 2026].
PostgreSQL Global Development Group 2026. PostgreSQL documentation. [Online]. Available at: https://www.postgresql.org/docs/ [Accessed 5 October 2026].
Software Freedom Conservancy 2026. Git documentation. [Online]. Available at: https://git-scm.com/doc [Accessed 5 October 2026].
