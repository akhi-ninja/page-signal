# PageSignal hosted account setup

Hosted sign-in uses GitHub OAuth and optionally LinkedIn OpenID Connect through Better Auth 1.7.25 with PostgreSQL. The workspace and community page show LinkedIn when credentials are configured. Admin sign-in remains GitHub because administrator authorization uses linked GitHub numeric IDs. Email sign-in remains hidden. Authentication is separate from the GitHub integration used to commit this repository.

## Required infrastructure

Create a dedicated PostgreSQL database (for example Neon) for PageSignal. Do not reuse another application's database credentials. In Vercel → page-signal → Settings → Environment Variables, configure the following for Production. Use separate secrets/provider apps and a stable callback origin for Preview; do not allow all vercel.app origins.

| Environment variable | Value |
| --- | --- |
| DATABASE_URL | PostgreSQL connection string with verified TLS from your database provider |
| BETTER_AUTH_URL | `https://www.pagesignal.studio` (or your final custom origin) |
| BETTER_AUTH_SECRET | A cryptographically random secret of at least 32 characters |
| GITHUB_CLIENT_ID | GitHub OAuth application client ID |
| GITHUB_CLIENT_SECRET | GitHub OAuth application client secret |
| LINKEDIN_CLIENT_ID | LinkedIn app client ID; optional alternative to GitHub |
| LINKEDIN_CLIENT_SECRET | LinkedIn app client secret; required to enable LinkedIn |
| RESEND_API_KEY | Optional future phase; leave unset |
| AUTH_EMAIL_FROM | Optional future phase; leave unset |
| OPENAI_API_KEY | Existing server-side provider key |

Optional: OPENAI_DOCUMENT_MODEL, PAGESIGNAL_DAILY_AI_REQUESTS (default 20), PAGESIGNAL_AI_REQUESTS_PER_MINUTE (default 6), PAGESIGNAL_GLOBAL_DAILY_AI_REQUESTS (default 200). These count AI attempts, not documents. Every extracted page and every question consumes one request, including provider failures after a reservation. Invalid or failed requests may also consume a reservation; counters are not billing credits. Defaults reset daily at 00:00 UTC and minute limits use UTC minute boundaries. The global cap protects the shared provider budget across accounts. It is not a monetary spending limit; configure an appropriate provider budget as well.

Generate BETTER_AUTH_SECRET locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Store the result directly in Vercel; never commit it or paste it into a public issue. Changing the secret can invalidate sessions and make encrypted provider tokens unreadable.

## Register sign-in providers

### GitHub

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.

- Name: PageSignal
- Homepage: `https://www.pagesignal.studio`
- Authorization callback URL: `https://www.pagesignal.studio/api/auth/callback/github`
- This app requests read:user and user:email only; no repository access.

Copy its client ID and generated secret into Vercel. A repository installation for ChatGPT is not the login application.

### LinkedIn

Create a LinkedIn developer app and enable the **Sign In with LinkedIn using OpenID Connect** product. Register:

`https://www.pagesignal.studio/api/auth/callback/linkedin`

Save both credentials for Production and redeploy. `LINKED_CLIENT_ID` is accepted as a legacy fallback; `LINKEDIN_CLIENT_ID` takes precedence. No client secret is exposed in status responses or browser code. The integration requests openid, profile, and email only. Some LinkedIn accounts may not provide a verified email claim. AI access requires a verified email; verify the email with LinkedIn and sign in again, or use GitHub with a verified email. Do not bypass this requirement or manually mark accounts verified. The app does not silently link different social providers by a matching email. Use the original provider to return to an existing account. An `account_not_linked` error means the email belongs to an existing account. Sign in with its original provider, open Account, and choose Connect LinkedIn. Explicit linking uses the authenticated `/api/auth/link-social` flow with session/state validation. `disableImplicitLinking: true` prevents sign-in from merging by email, and `allowDifferentEmails: false` requires matching emails. LinkedIn must supply a verified email; no trusted-provider bypass is configured. Existing identity conflicts are rejected. The account ID, quotas and existing GitHub identity are preserved. LinkedIn login does not grant admin access. OAuth redirects reload the tab; after login choose or drop your documents again.

### Email

Create a Resend account, verify a sending domain, and configure RESEND_API_KEY and AUTH_EMAIL_FROM. Magic links are one-time, expire in 10 minutes, and are hashed in the verification store. Never send the link URL to application logs. Use separate sender credentials for Preview if appropriate.

## Migrate before deploying

Install dependencies with `npm ci --ignore-scripts`. Export DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET, and provider/email settings into your trusted terminal environment, or a local ignored .env file. Then run:

```sh
npm run auth:migrate
```

This uses Better Auth's version-matched programmatic migrations and creates the PageSignal usage table. It is an explicit operator command; it does not run DDL during public requests. A failed or missing database migration causes account/AI operations to fail closed.

Deploy after configuration and migration. Verify GitHub and configured LinkedIn login, new and returning users, denied consent, collisions with existing accounts, verified-email enforcement, sign-out, anonymous API rejection (401), usage counters, and 429 limits. Test LinkedIn with the real app before claiming successful end-to-end production login. A status response reporting authConfigured only confirms configuration presence; it does not prove migrations, providers, or sender setup work.

## Self-hosting modes

The Node runner defaults to the existing shared service credential mode (PAGESIGNAL_API_KEY). The HTTP SDK continues to use this mode. Set `PAGESIGNAL_AUTH_MODE=accounts` to use browser accounts instead; all static assets remain public and AI requires a valid account cookie. The Vercel handlers always use account authentication and do not accept a service key as a bypass.

For local account testing, use BETTER_AUTH_URL=http://localhost:3000 and register matching local callbacks with separate provider apps. Reverse proxies must preserve Origin and cookies, and also proxy /api/auth/* when embedding the workspace. The SDK does not manage user login sessions or hosted account API keys.

## Security and operational notes

- Sessions are verified server-side on every AI call, not inferred from a client flag. Cookie caching is disabled so revoked sessions stop authorizing AI.
- Better Auth handles state, callback checks, cookies, CSRF protection, and session lifecycle. Exact trusted origins are configured; do not disable these checks.
- Auth rate-limit counters and AI quotas use PostgreSQL, shared across serverless instances. AI quotas reserve capacity in a transaction before provider access. Keep database connections bounded and use a provider-supported pooler.
- Vercel auth trusts x-vercel-forwarded-for only. Direct Node requests replace x-pagesignal-client-ip with the socket address; do not trust arbitrary client-supplied forwarded IPs.
- Provider tokens are encrypted. Do not add a browser token store, export sessions, or expose provider credentials in status responses.
- Usage counters contain pseudonymous account IDs and dates/counts, not document contents. Configure a retention/deletion process appropriate to your launch. Managed retention automation and account deletion UI are not included in this release.
- Before public launch, review Privacy Policy and Terms for the operator's actual practices and add a private support/deletion contact. Current Contact links to technical support on GitHub and warns against public disclosure of personal data.
- Provider credentials, database provisioning, sender verification, and real OAuth/email testing are deployment prerequisites. No successful live sign-in should be claimed from mocked tests alone.
