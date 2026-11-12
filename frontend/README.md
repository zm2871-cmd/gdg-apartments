# Hearthstone Hub frontend

Hearthstone Hub helps NYC renters review building records and compare apartments. This directory is a standalone React, TypeScript, and Vite application with its own npm lockfile. It starts with fictional data and runs without a backend, external map service, or authentication credentials.

## Run locally

Use Node.js 22.13 or later. Run these commands from `frontend/`.

```sh
npm ci
npm run dev
```

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
| `HEARTHSTONE_DEV_API_TARGET` | Optional backend origin for the Vite development proxy, for example `http://localhost:3000`. The proxy forwards `/api` and `/auth/callback`. |

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

1. Start the AptSignal backend using its own environment and setup. In local development set `VITE_DATA_PROVIDER=api`, `VITE_API_BASE_URL=/api`, and `HEARTHSTONE_DEV_API_TARGET=http://localhost:3000` in the frontend. Restart Vite when the configuration changes.
2. In deployment, serve the frontend and API on the same origin. Route `/api/*` and `/auth/callback` to the existing backend before applying the frontend’s history fallback. Preserve the original origin and forwarded host headers. The existing write routes validate the request origin against the backend request URL or `NEXT_PUBLIC_SITE_URL`.
3. For account access, configure Supabase on the backend and set `NEXT_PUBLIC_SITE_URL` to the frontend’s public origin. Add its `/auth/callback` URL to the Supabase redirect allowlist. The existing PKCE callback exchanges the code and redirects to `/saved`. Keep session cookies on that origin. A cross-origin API URL is also accepted by the adapter, but would require credentialed CORS and compatible cookie and callback configuration on the server.
4. Optionally set `VITE_MAP_STYLE_URL` to a compatible MapLibre style with public access and provider attribution. The demo map uses a local block illustration and percentage-based marker positions. API reports use geographic positions supplied by the backend.

The application calls the existing HTTP contracts through `ApiHousingDataProvider`, `ApiAuthAdapter`, and `ApiSavedAdapter`. It validates JSON responses, converts them to frontend models, and displays HTTP, connection, and malformed-response errors. In-flight reads pass an abort signal.

| Method and path relative to the API base | Used by the frontend |
| --- | --- |
| `GET /address/autocomplete?q=…` | Reads `{ candidates: Identity[] }` for 3–120 characters. |
| `GET /address/resolve?q=…` | Sends the exact selected candidate label and receives a canonical `Identity`. |
| `GET /buildings/:id` | Reads `{ identity, records, coverage, scores, checkedAt, demo }`. The timeline reveals more of the returned records in batches of three. Nearby markers use located records with nearby scope. |
| `POST /compare` | Sends `{ ids, weights? }` for two or three unique IDs. In default mode the server selects the weights. Reads `{ reports, ranked, common, missing }` and displays the supplied values and coverage. |
| `GET /account` | Reads the authenticated email. A 401 is a signed-out state. |
| `POST /auth` | Sends `{ email }` and displays the sign-in link status. |
| `DELETE /auth` | Signs out using the existing session cookie. |
| `GET /saved` | Reads `{ buildings: [{ building_id, … }], comparisons }`. |
| `POST /saved` | Saves a real building with `{ kind: "building", ids: [buildingId] }`. |
| `DELETE /saved` | Removes a saved building with `{ kind: "building", id: buildingId }`. |

`src/services/api.ts` contains the response schemas and mapping functions. The existing repository’s `docs/API.md` describes the server contract. If that contract evolves, extend the adapter and its fixtures so the pages can continue to use the same domain models.

## Data and feature boundaries

- **Demo data** uses three fictional buildings, an illustrated map, sample questions, and synthetic comparison scores. Mock saved building IDs, the comparison shortlist, and rating preferences use versioned browser storage. API mode uses account-backed saved buildings and a separate browser namespace for the comparison shortlist and preferences.
- **Ratings** support default, category, and subcategory preferences in mock mode. The mock scoring service weights grades shared by the selected properties and uses a subcategory only when each selected property has a score for it. The current backend supports category weights. The adapter mirrors its documented defaults for display and forwards category weights only when the user chooses them. Subcategory weighting needs an expanded backend scoring contract.
- **Report fields** such as overall grades, summaries, proximity, landlord questions, and snapshot-to-snapshot changes need backend values. The current trends endpoint supplies event-month counts. Historical changes stay unavailable until the server can supply a comparison of snapshots. The frontend distinguishes a missing change snapshot from a supplied snapshot with no changes.
- **Assistant** has a typed service boundary and a report panel that passes stable building IDs. The default service is unavailable. A future adapter can call a backend that retrieves structured building context and returns an assistant message.
- **Tooling** runs from this package’s directory. If you place it in a project that scans nested packages, exclude `frontend/` from the parent TypeScript and ESLint checks.
