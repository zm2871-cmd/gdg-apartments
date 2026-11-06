# Supabase and Vercel setup

## 1. Project and keys

Create a Supabase project at https://supabase.com/dashboard or reuse the original AptSignal project to share users. In project settings/API or Connect, find the project URL and the `sb_publishable_…` key. Put them in `.env.local` using the names in `.env.example`. Do not use the service-role or secret key. No database migrations are needed for this Auth-only application.

Choose an appropriate Supabase/hosting plan and inspect its limits yourself. This project does not activate subscriptions, configure billing or call AI providers.

## 2. Email/password and verification

In Authentication → Sign In / Providers, enable Email and password sign-in and **Confirm email**. Disable anonymous sign-ins unless separately needed. Set the minimum password length to 8. The app requires at least one uppercase letter, one number and one special character (spaces do not count). Configure Supabase’s required character settings to enforce these requirements as well; if its available preset also requires lowercase, that is an additional provider-side requirement. Consider leaked-password protection if available in your plan. Registration does not grant dashboard access until Supabase reports confirmed email.

A duplicate registration receives a generic verification-screen response. Recovery and resend messaging are also generic. Enable Supabase’s anti-enumeration settings and confirm behavior with both registered and unregistered test addresses.

## 3. URLs

Set Authentication → URL Configuration → Site URL to the current app origin, e.g. `http://localhost:3000` during development, then the actual HTTPS auth domain in production. Set `NEXT_PUBLIC_APP_URL` to exactly the same origin (no path, query, credentials or hash).

Add exact allowed redirect URLs:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback?next=/update-password
```

If using port 3001, add those exact equivalents. Production:

```text
https://YOUR_AUTH_DOMAIN/auth/callback
https://YOUR_AUTH_DOMAIN/auth/callback?next=/update-password
```

If using the optional signup token-hash template below, its actual confirmation URL is on the same configured auth origin. Avoid unrestricted wildcards in production. Do not allow arbitrary user-controlled destinations. If preview deployments are allowed, use narrowly scoped preview patterns and separate test users/project where practical.

## 4. Email templates — preferred PKCE flow

For **Confirm signup** and **Reset password**, preserve the Supabase-generated confirmation URL:

```html
<a href="{{ .ConfirmationURL }}">Continue securely</a>
```

Give each email a relevant heading (“Confirm your email” or “Reset your password”). Supabase validates the token and redirects to the supplied callback with a one-time code. The app exchanges that code using the cookie-held PKCE verifier. Open the link in the **same browser and same origin** that requested it. Request a new link if expired, already used, or opened on another device. Do not replace reset templates with an implicit access-token fragment URL or a direct link to `/update-password`.

### Optional signup token-hash flow

For a single auth-domain setup, **Confirm signup only** can instead use:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
```

`/auth/confirm` calls Supabase `verifyOtp` with `type: signup`, writes the session cookies and redirects without retaining the token. This supports opening signup confirmation on another browser. It does not support password recovery. Leave reset emails on the preferred PKCE `ConfirmationURL` flow so the server can verify Supabase’s recovery AMR claim. For a shared Supabase project, a SiteURL-based template sends every app’s signup confirmation to that site; prefer the standard ConfirmationURL templates to respect each app’s configured redirect.

Email scanners can consume single-use links. Disable email-provider click tracking and test your real mail client. If scanners cause failures, add a deliberate user-confirmation interstitial before exchange; do not log callback URLs, query strings, codes or token hashes.

## 5. SMTP and abuse controls

Configure production SMTP under Supabase Authentication settings using your sender domain and provider credentials, kept **in Supabase**, not frontend variables. Verify domain ownership, SPF/DKIM and delivery. Built-in email delivery may be restricted to authorized addresses and strict quotas; it is not a production SMTP substitute.

Configure Supabase native rate limits for signup, sign-in, resend and recovery. As an initial policy, enforce at least a 60-second resend interval and limit repeated authentication attempts per IP/account, then tune for your users. Configure deployment firewall controls as well: server actions may share the server’s apparent IP upstream. The UI’s 60-second cooldown can be bypassed and is not a distributed limiter.

Supabase supports CAPTCHA using supported providers. This app does **not** ship a CAPTCHA widget. To enable CAPTCHA, first add the matching client widget and pass its short-lived token through the validated server actions to Supabase `options.captchaToken` for supported operations; then enable CAPTCHA in Supabase. Enabling it only in the dashboard will correctly reject requests but break forms until the widget is integrated. Do not bypass CAPTCHA errors. See [Supabase bot detection](https://supabase.com/docs/guides/auth/auth-captcha).

## 6. Vercel

Push **only this folder’s contents** to a dedicated GitHub repo. Import into Vercel as a Next.js project. Root directory is the repository root after extraction. If temporarily importing the parent repository, set Root Directory to `aptsignal-auth` without changing the main deployment.

- Node: compatible Node 22 LTS (22.13+).
- Install: `npm ci`.
- Build: `npm run build` (supported Webpack compiler).
- Output directory: Next.js default.
- Add the three required public variables and optional password policy variables separately for Preview/Production.
- Register the exact deployment origin/callbacks in Supabase. Rebuild after public environment variable changes.
- Force HTTPS, monitor authentication errors without sensitive request payloads, and avoid caching auth responses.

If using a custom Supabase domain, add that explicit origin to `connect-src` in `next.config.ts`. Current CSP supports default `*.supabase.co` endpoints. Inline script support is retained for Next.js hydration; a strict nonce CSP can be added as a future hardening step. No analytics or third-party image/font fetches exist.

## 7. Live acceptance checklist (requires your configured project)

Use your own consenting test mailboxes, never real user records:

1. Register with a new mailbox; ensure no dashboard access before confirmation.
2. Click the newest confirmation link in the requesting browser. Verify name/email in dashboard.
3. Reload and close/reopen browser; verify session persistence. Test refresh after access-token expiry.
4. Sign out; verify dashboard redirects. Test a fresh incognito browser too.
5. Sign in with correct and incorrect credentials; verify generic failure and no password leakage.
6. Repeat signup with the same email; ensure no explicit account-existence disclosure.
7. Request password recovery for both existing and unknown addresses; compare generic messages.
8. Open reset email in the same browser; verify recovery page, invalid-password errors, successful update and new-password login. Check old password fails.
9. Visit `/update-password` with ordinary login and forged query parameters; ensure access is denied.
10. Test expired/replayed links and a different-browser PKCE link; verify safe retry guidance.
11. Sign in two test accounts in separate browsers and confirm account details cannot cross sessions.
12. After password update/global logout, account for Supabase’s already-issued JWT lifetime; configure short appropriate lifetimes and reauthentication policies. The app additionally calls `getUser()` before dashboard access.
13. Inspect cookie refresh and redirects in browser tools, confirming HTTPS and same-origin cookies. Tokens never appear in page content, logs or final destination URLs.
14. Replace legal placeholders, verify actual SMTP delivery, abuse limits, origin configuration, and provider budgets before launch.

## Official references

- [Supabase SSR clients and proxy](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Password-based auth and recovery](https://supabase.com/docs/guides/auth/passwords)
- [Verified JWT claims and recovery AMR](https://supabase.com/docs/guides/auth/jwt-fields)
- [Redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Production SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
