# AptSignal Auth

Independent Next.js 16 authentication application with AptSignal’s warm ivory / forest-green design. It uses Supabase Auth exclusively, React Hook Form + shared Zod validation, cookie-based SSR, a refresh proxy, and source-owned shadcn/ui-style Radix primitives.

**No AI, payment integration, custom JWTs, custom password storage, demo login, or authentication bypass exists.** A Supabase/hosting provider may have its own usage charges; nothing is provisioned or purchased by this code.

## Quick start

Use Node 22.13+ LTS or a compatible newer release.

```sh
cd aptsignal-auth
npm ci
cp .env.example .env.local
# Edit .env.local with your own project URL and PUBLISHABLE key.
npm run dev
```

Open http://localhost:3000. To run alongside the original AptSignal app, set `NEXT_PUBLIC_APP_URL=http://localhost:3001`, then use `npm run dev -- --port 3001`. Cookies are host-scoped, not port-scoped: two localhost apps using the same project can affect each other’s session. Use different local hostnames if testing isolated sessions.

Without configuration, public forms render a clear setup notice and return an explicit unavailable result. Private pages stay protected. No successful login is simulated.

## Configuration

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_MIN_PASSWORD_LENGTH=8
```

Use the **publishable** key, not an `sb_secret_*` or service-role key. The original AptSignal app uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`; this standalone app intentionally uses the requested publishable-key name. Both keys can belong to the **same Supabase project and users**. No credentials were copied from the main app. Browser-exposed variables are compiled at build time; rebuild after changes.

The minimum password length is constrained to 8–64; invalid settings default to 8. New passwords are capped at 128 characters. New passwords always require an uppercase letter, a digit and a non-whitespace special character. Existing-password login is not subjected to new-password strength rules. Mirror policy in Supabase so direct API requests enforce the same requirements.

## Routes

| Route | Purpose |
|---|---|
| `/` | Redirect to sign-in |
| `/sign-in` | Email/password login; validated internal destination |
| `/sign-up` | Name, email, password confirmation, draft-policy acknowledgment |
| `/verify-email` | Generic confirmation guidance and resend form |
| `/forgot-password` | Generic reset request; no account-existence disclosure |
| `/auth/callback` | PKCE code exchange for signup/recovery; strips callback parameters |
| `/auth/confirm` | Optional **signup-only** token-hash confirmation template |
| `/update-password` | Validated, recent Supabase recovery session required |
| `/dashboard` | Server-protected account demonstration and logout |
| `/terms`, `/privacy` | Clearly marked legal placeholders requiring review |

## Security architecture

- `src/lib/supabase/client.ts`: reusable browser client. Auth mutations in this app use server actions.
- `src/lib/supabase/server.ts`: new SSR client per request, `getAll`/`setAll` cookie handling. Writes are enabled explicitly in actions/handlers; server components remain read-only.
- `src/lib/supabase/proxy.ts` and `src/proxy.ts`: `getClaims()` refreshes the session, writes cookies to both request and response, and preserves cookies when redirecting. Proxy is an early gate, not the sole authorization check.
- `src/lib/auth/session.ts`: verifies claims and calls `getUser()` for authoritative server access. Requires a matching subject and confirmed email. No authorization from raw `getSession()`, decoded JWTs or client metadata.
- Password recovery uses **PKCE**, the same browser’s verifier, and Supabase-signed `amr.method = recovery` within one hour. The page and mutation both check this. `?type=recovery` alone has no effect. The optional token-hash signup route intentionally does not accept recovery; use the documented reset email template.
- Password update signs out globally after success; ordinary logout is local to this browser. Already-issued access tokens may remain valid until expiry under Supabase’s session semantics; see the deployment checklist.
- `safeDestination` accepts only `/dashboard`. Extend its allowlist deliberately when integrating more protected routes. Callback destinations use configured APP_URL, not arbitrary user URLs or forwarded hosts.
- Next.js server actions apply same-origin CSRF protection and a 32 KB body limit. All mutations validate again on the server. Sensitive values are never logged or echoed in errors. Callback responses are no-store with no-referrer; no third-party scripts run on token-handling pages.
- No separate profile table: display name is stored in `auth.users.user_metadata.full_name` and shown as escaped text. Metadata is **not** an authorization source. This avoids migrations/RLS obligations for unused application tables. Add owner-only RLS if you later create a profile table.

## Supabase / deployment

Follow [the full deployment guide](docs/DEPLOYMENT.md) for project setup, URL allowlists, email templates, SMTP, security controls and Vercel. Follow [integration notes](docs/INTEGRATION.md) to reuse this in the main app without conflicting proxies or domains.

Legal routes are placeholders. Replace them with reviewed policies and update the acknowledgment version before inviting real users. Provider quotas and CAPTCHA must be configured before public launch; the form cooldown is UX only, not a server security control.

## Testing

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest mocks live only under `tests/` and cannot be enabled in the runtime application. They cover validation, safe errors, account enumeration messaging, callback redirects, verified session checks, recovery authorization, refresh cookies, signup, logout and form behavior. Browser tests exercise the real production application in explicitly **unconfigured** mode; they do not pretend to prove hosted email delivery or live login.

For deterministic unconfigured E2E, build with empty Supabase variables and no credential-bearing `.env.local`; the Playwright server uses port 3101. A configured live project needs the separate manual lifecycle checklist in the deployment guide.

See [VERIFICATION.md](docs/VERIFICATION.md) for commands actually executed and limitations.

## Structure

```text
src/app/                    Auth pages, protected dashboard, callback handlers
src/components/auth/        Forms, password field, branded layout
src/components/ui/          Source-owned shadcn/ui-style Button, Input, Radix Label
src/lib/auth/               Actions, schemas, session/recovery guards, safe redirects
src/lib/supabase/           Browser, server and proxy clients
src/proxy.ts                Single Next.js 16 session-refresh entry point
tests/                      Isolated unit/component mocks and browser tests
public/                     Local branding assets (no external image services)
docs/                       Deployment, integration, verification and publishing
```

Everything is inside this folder. All application imports are local relative imports, making the folder portable without parent aliases. No nested Git repository was created, no remote changed, and nothing was pushed.

## Publish only this project

Use [docs/PUBLISHING.md](docs/PUBLISHING.md) for exact copy-and-push commands. Copy the folder to a separate location, excluding `.env*` except `.env.example`, `node_modules`, `.next`, test output and local artifacts, then initialize Git **in that copy**. Do not initialize Git in the parent AptSignal folder for this task.
