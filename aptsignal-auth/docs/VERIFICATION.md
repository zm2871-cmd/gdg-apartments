# Verification and remaining setup

Local verification completed November 5, 2026:

| Check | Result |
| --- | --- |
| Standalone TypeScript check | Passed |
| Standalone ESLint | Passed |
| Vitest unit/component tests | 62 passed across 7 files |
| Playwright Chromium tests against production build | 10 passed |
| Fresh independent copy, npm ci and production build | Passed outside the parent repository |
| Dependency audit at installation | Zero reported vulnerabilities |
| Original AptSignal typecheck, lint and tests | Passed; 52 tests |

Browser coverage includes 375px, 768px and 1440px layouts, form validation, truthful missing-configuration states, forged-cookie rejection, protected dashboard redirects, recovery-page access denial, invalid callback handling, and public navigation. Desktop and mobile screenshots were visually inspected. Provider interactions in unit tests use isolated mocks; the running application has no fake authentication mode.

The standalone production build used its own lockfile, dependencies and configuration in a fresh temporary directory. No imports or runtime files from the parent application were needed. The original application's source/configuration files were unchanged; its TypeScript check updated only generated tsconfig.tsbuildinfo cache data.

## Not verified live

No Supabase credentials were supplied. Registration, real sign-in, confirmation delivery, recovery email delivery, token refresh and logout against a real Supabase project have **not** been verified. No project, SMTP account, paid service or deployment was provisioned. There is no AI or payment integration in this application.

Before production use, follow [DEPLOYMENT.md](DEPLOYMENT.md): configure the publishable key, project URL and app origin; enable email/password and confirmation; register exact redirect URLs; configure email templates and production SMTP; mirror the password policy; configure provider rate limits; and run its live acceptance checklist. Replace the clearly marked Terms/Privacy drafts after legal review. CAPTCHA integration is documented but its widget/token plumbing is not implemented; add that before enabling CAPTCHA in Supabase.

Publish only the standalone folder using [PUBLISHING.md](PUBLISHING.md). No Git repository was initialized and nothing was pushed.
