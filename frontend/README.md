# Hearthstone Hub frontend

Hearthstone Hub helps NYC renters review building records and compare apartments. This directory is a standalone React, TypeScript, and Vite application with its own npm lockfile. It starts with fictional data and runs without a backend, external map service, or authentication credentials.

## Run locally

Use Node.js 22.13 or later. This package lives in `frontend/` directly inside the Git repository root. In this checkout the project root is `GDG/gdg-apartments/`; `GDG/` is an outer wrapper repository.

From the project root, run the following commands.

```sh
cd frontend
npm install
npm run dev
```

For a reproducible install using this package's `package-lock.json`, use `npm ci` in place of `npm install`. Run the remaining commands from `frontend/`. The package defaults to mock mode and starts with the backend offline.

Open the local URL printed by Vite. Start with **123 Example Street** or visit `/building/example-street`. The other sample reports are **48 Sample Avenue** and **76 Demo Place**. The three reports include different coverage levels so you can see how missing information appears.

```sh
npm run typecheck
npm run build
npm run preview
npm test
npx playwright install chromium
npm run test:e2e
```

The production bundle is in `dist/`. Serve the assets directly and route frontend URLs such as `/building/:buildingId` to `index.html`. The Playwright suite starts its own Vite server in mock mode.

## Environment

Copy `.env.example` to `.env.local` to customize the defaults. Every `VITE_` value is public and embedded in the client build.

| Variable | Purpose |
| --- | --- |
| `VITE_DATA_PROVIDER` | `mock` by default. Set to `api` to use the existing backend. |
| `VITE_API_BASE_URL` | Required in API mode. Include the backend’s API prefix, for example `/api` for a same-origin deployment. |
| `VITE_MAP_STYLE_URL` | Optional public MapLibre style URL. Live reports retain a browsable list of located issues if the street map is unavailable. |
| `HEARTHSTONE_DEV_API_TARGET` | Optional backend origin for the Vite development proxy, for example `http://localhost:3000`. The proxy forwards `/api`. The frontend handles `/auth/callback`. |
| `VITE_SUPABASE_URL` | Public URL of the Supabase project shared with the backend. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable API key from that project. |
| `VITE_SUPABASE_ANON_KEY` | Optional legacy public anon-key fallback. |

## Application structure

| Path | Responsibility |
| --- | --- |
| `src/app/` | Routing, shared state, and cancellable request lifecycle |
| `src/pages/` | Home, search, reports, comparison, saved properties, account, and methodology |
| `src/components/` | Address suggestions, grade details, issue timeline, map, rating controls, assistant, and skeletons |
| `src/domain.ts` | Frontend models for buildings, reports, grades, issues, markers, changes, and comparisons |
| `src/services/` | Provider contracts, mock fixtures, API schemas and mappings, authentication and persistence |
| `src/styles/` | Layout, responsive styling, and presentation |
| `tests/` | Vitest service tests and Playwright user flows |

## Connect the existing backend

1. Start the existing backend separately. In local development set `VITE_DATA_PROVIDER=api`, `VITE_API_BASE_URL=/api`, and `HEARTHSTONE_DEV_API_TARGET=http://localhost:3000` in the frontend. Restart Vite when configuration changes.
2. In deployment, route `/api/*` to the backend and serve `/auth/callback` through the frontend's `index.html` history fallback. The callback uses the browser Supabase client to complete PKCE.
3. Private saved-apartment requests carry the current Supabase access token as `Authorization: Bearer …`. They omit cookies so an older backend cookie cannot select a different account. The backend must verify the JWT against the same Supabase project and use the verified subject for owner checks. The current backend uses cookie sessions, so cloud saves require bearer-token support on the backend before they can work with this browser OAuth flow. That backend work is outside this frontend change.
4. Optionally set `VITE_MAP_STYLE_URL` to a compatible MapLibre style with public access and provider attribution.

The application calls the existing HTTP contracts through `ApiHousingDataProvider`, `ApiAuthAdapter`, and `ApiSavedAdapter`. It validates JSON responses, converts them to frontend models, and displays HTTP, connection, and malformed-response errors. In-flight reads pass an abort signal.

| Method and path relative to the API base | Used by the frontend |
| --- | --- |
| `GET /address/autocomplete?q=…` | Reads `{ candidates: Identity[] }` for 3–120 characters. |
| `GET /address/resolve?q=…` | Sends the exact selected candidate label and receives a canonical `Identity`. |
| `GET /buildings/:id` | Reads `{ identity, records, coverage, scores, checkedAt, demo }`. The timeline reveals more of the returned records in batches of three. Nearby markers use located records with nearby scope. |
| `POST /compare` | Sends `{ ids, weights? }` for two or three unique IDs. In default mode the server selects the weights. Reads `{ reports, ranked, common, missing }` and displays the supplied values and coverage. |
| `GET /saved` | Reads `{ buildings: [{ building_id, … }], comparisons }`. |
| `POST /saved` | Saves a real building with `{ kind: "building", ids: [buildingId] }`. |
| `DELETE /saved` | Removes a saved building with `{ kind: "building", id: buildingId }`. |

`src/services/api.ts` contains the response schemas and mapping functions. The existing repository’s `docs/API.md` describes the server contract. If that contract evolves, extend the adapter and its fixtures so the pages can continue to use the same domain models.

## Supabase authentication

The frontend has one centralized `@supabase/supabase-js` client in `src/lib/supabase.ts`. Authentication is independent of the housing data provider, so you can sign in while exploring mock reports. Missing configuration produces an explanation on the login and signup pages while public research remains available.

```dotenv
VITE_DATA_PROVIDER=mock
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

Use the same Supabase project as the backend. Legacy projects can set `VITE_SUPABASE_ANON_KEY` instead. Provider client secrets and service-role keys belong in server or dashboard configuration. The frontend rejects privileged keys.

### Provider dashboard setup

1. In Supabase, open Authentication and the provider configuration. Copy the project's OAuth callback URL, typically `https://your-project-ref.supabase.co/auth/v1/callback`. Use the exact URL from the dashboard, including any configured custom Auth domain.
2. In Google Cloud, configure the OAuth consent screen and a Web application OAuth client. Add the frontend origin to authorized JavaScript origins and the Supabase OAuth callback URL to authorized redirect URIs. Copy the Google client ID and secret into Supabase's Google provider settings and enable the provider. For a Google app in testing, add the intended test users.
3. In GitHub Developer settings, register an OAuth App. Set its homepage to the frontend URL and its authorization callback to the Supabase OAuth callback URL. Copy its client ID and generated client secret into Supabase's GitHub provider settings and enable GitHub.
4. In Supabase Authentication URL configuration, set Site URL to the deployed frontend origin. For a local-only project, use the local frontend origin.
5. Add exact frontend redirect URLs to Supabase's redirect allowlist. Include `http://127.0.0.1:5173/auth/callback`, `http://localhost:5173/auth/callback`, and the production `https://your-frontend.example/auth/callback`. Add an exact callback URL for any additional development port or deployed origin.
6. Set the frontend environment variables and restart Vite. Test with the same hostname, browser, and device for the start and completion of each PKCE flow.
7. Enable Supabase Email authentication and registration if you want email signup links. Configure SMTP and email templates for your deployment and test delivery.

The provider callback goes to Supabase's `/auth/v1/callback`. Supabase then redirects to the frontend's `/auth/callback`. The two URLs have distinct roles. The repository cannot enable providers or configure their secrets in the dashboards.

Google and GitHub create new Supabase users according to the project's registration settings. The existing email-link interface is retained for login and signup. Login links set `shouldCreateUser: false`; signup links allow account creation. The frontend has no password fields.

The client uses `flowType: 'pkce'` and disables automatic URL detection. The callback adapter exchanges each code once, retrieves the user through Supabase, and returns to a validated internal destination. React development remounts share the exchange promise. The SDK handles session persistence, refresh, and cross-tab auth events. Sign-out clears authenticated UI and protected-route access through that same client.

`/account` requires a session. `/saved` requires a session in API mode, and mock saves remain available to anonymous visitors. Home, search, reports, comparisons, and methodology remain public.

Supabase browser sessions are separate from the existing backend's cookie sessions. The API client retrieves the latest SDK token for each private request. Frontend route guards control navigation. The backend remains responsible for JWT verification and resource authorization.

See the official [Google provider guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [GitHub provider guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-github), and [PKCE guide](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

### Authentication tests

`npm test` covers configuration, provider calls, callback deduplication, redirect validation, auth events, current bearer tokens, and user-scoped mock saves. `npm run test:e2e` starts one unconfigured server and one server with a fake Supabase project. Browser tests intercept Auth endpoints to exercise both providers, email signup and login, refresh persistence, failures, sign-out, protected navigation, and account isolation.

These automated tests use synthetic sessions and mocked Auth responses. Real Google and GitHub redirects require configured providers and live credentials, followed by manual verification. No dashboard setup or real-provider login has been verified as part of this implementation.

## Data and feature boundaries

- **Demo data** uses three fictional buildings, an illustrated map, sample questions, and synthetic comparison scores. Mock saved building IDs use separate versioned storage keys for anonymous visitors and each Supabase user. Anonymous saves stay in their existing key. The comparison shortlist and preferences retain their existing device-local persistence. API mode uses the saved-buildings adapter described above.
- **Ratings** support default, category, and subcategory preferences in mock mode. The mock scoring service weights grades shared by the selected properties and uses a subcategory only when each selected property has a score for it. The current backend supports category weights. The adapter mirrors its documented defaults for display and forwards category weights only when the user chooses them. Subcategory weighting needs an expanded backend scoring contract.
- **Report fields** such as overall grades, summaries, proximity, landlord questions, and snapshot-to-snapshot changes need backend values. The current trends endpoint supplies event-month counts. Historical changes stay unavailable until the server can supply a comparison of snapshots. The frontend distinguishes a missing change snapshot from a supplied snapshot with no changes.
- **Assistant** has a typed service boundary and a report panel that passes stable building IDs. The default service is unavailable. A future adapter can call a backend that retrieves structured building context and returns an assistant message.
- **Tooling** runs from this package’s directory. If you place it in a project that scans nested packages, exclude `frontend/` from the parent TypeScript and ESLint checks.
