---
name: verify
description: How to run and verify Flinder locally without a Postgres database.
---

# Verifying Flinder

Flinder is an Express + Postgres app with a vanilla JS frontend in `public/`.
`npm start` requires a real `DATABASE_URL`, which sandboxes usually don't have.

## Frontend-only changes (public/*)

No database needed. Serve `public/` statically and stub the two read
endpoints — the frontend only needs `GET /api/flipcharts` and
`GET /api/locations` to render everything:

- `/api/locations` → `[{ id, name, flipchart_count }]`
- `/api/flipcharts` → `[{ id, name, location_id, location_name, status, notes, updated_at }]`
  where `status` ∈ `available | in-use | needs-supplies`, `location_id`/`location_name`
  are `null` for unassigned, and `updated_at` is an ISO timestamp.

Drive it with Playwright. In this environment use the pre-installed browser:
`chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` with
`playwright-core` (install it in the scratchpad, not the repo). A working
script pattern: in-process `http.createServer` that returns the stub JSON for
the two API paths and serves files from `public/` otherwise, then screenshot
desktop (1280px) and mobile (390px), both tabs, the add-flipchart dialog,
search/chip filtering, and check `document.documentElement.scrollWidth` for
mobile overflow.

Gotchas:
- Google Fonts (Cormorant Garamond, Inter) load from the network; check
  `document.fonts.check('16px "Cormorant Garamond"')` — through the sandbox
  proxy an occasional `ERR_CONNECTION_RESET` console error appears even when
  fonts load fine.
- Mutations (POST/PATCH/DELETE) will 404 against the stub server — either stub
  them too or keep probes read-only.

## Backend changes (app.js, db.js, api/)

Need a real Postgres (`DATABASE_URL` in `.env`), then `npm start` and hit
`http://localhost:3000/api/...`. Schema is created and seeded on first request.
