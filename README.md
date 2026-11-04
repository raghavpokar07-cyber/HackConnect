# HackConnect

HackConnect is a collaboration platform concept for students who want to meet teammates, discover hackathons, and build projects together.

Live app: [HackConnect — Find your people](https://hack-connect-raghavpokar07-cyber.vercel.app/)

## Current implementation

The app includes a responsive landing page and workspace pages for discovery, connections, teams/tasks, team messages, hackathon saves/interests, notifications, profiles, achievements, and reputation. Profile, connection, team, task, message, saved-event, achievement, review, and notification changes use authenticated MongoDB API routes. Event cards read a shared MongoDB catalog populated by the local crawler; event registration remains on the organizer’s website.

The Express/TypeScript API uses MongoDB-backed email/password accounts, optional Google sign-in, optional authenticator-app MFA, and an optional Gemini team-plan endpoint. For the basic app, the only required secret is the MongoDB Atlas URI and a JWT signing secret; Google and Gemini are optional integrations.

## Stack

- React 18 and TypeScript
- Vite
- Lucide icons
- Express 5, Mongoose, and MongoDB Atlas
- Google Identity Services and Gemini Developer API

## Local development

Requirements: Node.js 20.19 or later and npm.

```sh
npm install
```

Create or edit the ignored local `.env` file in the project root and set the required values, then run the frontend and API in separate terminals:

```sh
notepad .env
npm run server:dev
npm run dev
```

The Vite dev server proxies `/api` requests to `http://127.0.0.1:4000`. Check `http://127.0.0.1:4000/api/health` to see which integrations are configured.

The API includes account/session and MFA routes under `/api/auth`, profile and discovery routes under `/api/profile` and `/api/users`, certificate achievement routes under `/api/achievements`, connection requests under `/api/connections`, team/task/message routes under `/api/teams`, the shared event catalog and saved-event state under `/api/hackathons`, notifications under `/api/notifications`, reviews under `/api/ratings`, and the optional authenticated `POST /api/assistant/plan` endpoint. Team owners can add accepted connections as teammates. Routes validate request bodies, require authenticated membership for private team data, and apply rate limits to sign-in and write operations. Google sign-in will not silently link to an existing email/password account.

### Hackathon catalog and local crawler

The landing page and workspace use the same event catalog. To ingest accessible listings, start the API and MongoDB, then run the crawler once:

```powershell
npm run crawler:hackathons
```

For automatic refresh every six hours, run `npm run crawler:watch` in a separate terminal. Configured sources are Unstop, Devpost, MLH, HackerEarth, and Devfolio. Devfolio uses its public GraphQL listing; MLH is read from the current season's public event payload; other sources are parsed from JSON-LD first and can use a locally running Ollama instance as a fallback (`qwen2.5:7b-instruct` by default; override with `OLLAMA_MODEL`). To refresh one source, pass its ID, for example `npm run crawler:hackathons -- --source=devfolio`. Ollama and its model are optional and local; no cloud AI key is used for crawling.

Source access and page formats vary. The crawler records per-source health and may report blocked/error states or no extractable events. It only uses public pages it can access, allows a single HTTPS redirect to a pre-approved source host, and does not bypass login pages, 403 responses, rate limits, or anti-bot controls. Team size and prize pool are shown only when explicitly available in source data; missing values are not guessed. Catalog records are extracted data, not organizer verification; dates, team sizes, prizes, and registration links can change. Users must verify event details and register with the organizer.

Profiles are public by default; a single profile-visibility setting hides a private profile from discovery and profile lookup. Opening a public builder goes to a separate profile page with their shared details, public ratings, and public certificates. Private profiles do not expose ratings or certificates. The API does not return private profile fields on profile pages. Users can optionally save format/category/destination preferences for new-hackathon notifications. Connection, team, message, and rating activity is delivered in the in-app Notifications page. Operational errors are not broadcast as notifications.

All unsafe API requests require a signed double-submit CSRF token and reject an unapproved `Origin`/`Referer`. The SPA fetches `/api/auth/csrf` automatically and sends the token in `X-CSRF-Token`. Local API clients should first GET `/api/auth/csrf`, retain its cookie in their cookie jar, and send the returned value in that header with each POST, PUT, PATCH, or DELETE request. Clients without an `Origin` header are supported when they supply the token and cookie.

Users can enroll an authenticator app from **My profile → Authenticator-app MFA** after reauthenticating with their account password or Google. Sign-in then requires a one-time code before an authenticated session cookie is issued. TOTP secrets are encrypted in MongoDB using a key derived from `JWT_SECRET`; keep that secret stable and backed up, since rotating it requires affected users to enroll MFA again. Disabling MFA requires both primary-provider reauthentication and a fresh authenticator code.

Achievements require a certificate photo. Uploads are limited to 5 MiB and accepted only when Sharp can decode them as JPEG, PNG, or WebP; stored images are normalized WebP. Profiles can store up to 25 achievements. Images are private by default. Publishing requires an explicit consent checkbox/confirmation, and the owner can make a certificate private or remove it later. Public achievement metadata is available from `GET /api/users/:userId/achievements`; image access is public only while the owner has enabled visibility.

Email verification, password reset, team join/approval requests, real-time message push, event registration, moderation, and deployment are not implemented. Messages persist and refresh while the chat is open; they are not yet pushed over a websocket. There is no public system-announcement publisher; system notifications are not generated from raw server errors.

### Test accounts

After configuring a **development** Atlas database, seed four fake `.test` accounts plus sample connections, a team, tasks, and messages:

```powershell
npm run db:seed:demo -- --confirm-dev-database
```

The script refuses to run in production, does not overwrite existing accounts, and generates a random password for each newly created test account. Copy the credentials from the terminal output; passwords are not stored in the repository or printed again on later runs. Use these accounts only in a development database. The test email domains are reserved, so they cannot receive mail.

Add your own test account from the signup page as usual. Do not seed demo data in the database used for real users.

### Public API identifiers

The API uses random UUIDv4 identifiers for users, teams, tasks, achievements, connections, messages, notifications, ratings, and hackathon records. MongoDB ObjectIds remain internal for database relationships and are not intended to be used as API identifiers. UUIDs make IDs harder to enumerate; they do not grant access. Private API operations still require a valid session and the appropriate owner/team-member check.

Before deploying this version against an existing database, take a database backup and run the one-time backfill against that database:

```powershell
npm run db:migrate:public-ids
```

The command requires `MONGODB_URI` and assigns UUIDs to existing records and embedded tasks. Run it before deploying the API/client changes so every existing record has a public ID. Existing sessions use the previous identifier format and users will need to sign in again after deployment.

### Environment setup

- **MongoDB Atlas:** Use an existing cluster, a dedicated least-privilege database user, and an IP access-list entry. Put the complete Atlas connection string in `MONGODB_URI`, replace the username/password placeholders, and include `/hackconnect` as the database name before the query string.
- **Web origins:** Set `WEB_ORIGIN` to the exact Vercel site origin. Multiple allowed origins can be comma-separated, without spaces.
- **Session signing:** Set `JWT_SECRET` to a random secret of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- **Google sign-in (optional):** Create a Google OAuth client ID for a web application and add the exact local origin you use, such as `http://localhost:5173` and/or `http://127.0.0.1:5173`, as authorized JavaScript origins. Put the client ID in both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`. The client ID is public; do not put a Google client secret in the frontend.
- **Gemini sidekick:** Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY`. The key stays on the server; never use a `VITE_` prefix for it. The free tier has model and rate limits, is not unlimited, and may use submitted content to improve Google products. Do not send sensitive/private team information to the free-tier model.

Keep `.env` local and never commit or paste secrets into chat. MongoDB credentials are required for persistent app use; Google and Gemini keys are only needed for their optional features.

Create a production build with `npm run build`, then preview the frontend with `npm run preview`. Compile the API separately with `npm run server:build`; start the compiled API with `npm run server:start`.

Run the focused TOTP, encryption, and CSRF tests with `npm run test:security`, and event parser tests with `npm run test:hackathon-sources`.

## Product direction

The next product stages are: email verification/password reset, team join requests, real-time messaging, stronger event-source integrations and organizer verification, moderation, and production deployment.
