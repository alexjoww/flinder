# Flinder 🧭📋

**Flinder** keeps track of every flipchart around the resort so you always know
where to find one — whether it's parked at Horizon Point, Wisteria, the
Auditorium, Telco, the Lab, or Nightcap.

## Features

- **Individual tracking** — every flipchart has a name (e.g. `FC-01`), a current
  location, a status, and optional notes.
- **Status tracking** — mark flipcharts as *Available*, *In use*, or
  *Needs supplies* (out of paper or markers).
- **Search & filter** — search by name, location, or notes; filter by location
  and status with live counts.
- **Quick moves** — change a flipchart's location or status right from its card.
- **Location management** — add, rename, or delete resort locations. Deleting a
  location leaves its flipcharts unassigned rather than losing them.
- **Shared data** — an Express API backed by Postgres means everyone who opens
  the app sees the same live inventory.

## Running locally

Requires Node.js 22 and a Postgres connection string (a free
[Neon](https://neon.tech) database works great, or any local Postgres).

```bash
npm install
cp .env.example .env   # then paste your DATABASE_URL into .env
npm start
```

Then open <http://localhost:3000>. On first run the schema is created and
seeded with the six resort locations and a few sample flipcharts.

## Deploying to Vercel with Neon Postgres

1. **Create the database** — sign up at [neon.tech](https://neon.tech), create
   a project, and copy the **pooled** connection string (in the connect
   dialog, keep "Connection pooling" on — the host contains `-pooler`).
   The pooled endpoint matters on Vercel: serverless functions open many
   short-lived connections, and the pooler absorbs them.

   > Tip: if you install the [Neon integration](https://vercel.com/marketplace/neon)
   > from the Vercel Marketplace instead, it creates the database and sets
   > `DATABASE_URL` on the project for you — you can then skip step 3.

2. **Import the repo** — go to [vercel.com/new](https://vercel.com/new) and
   import this repository. Leave the framework preset as **Other**; no build
   command is needed. Vercel serves `public/` as the static frontend and wraps
   `api/index.js` (the Express app) as a serverless function; `vercel.json`
   routes every `/api/*` request to it.

3. **Set the environment variable** — in the project's **Settings →
   Environment Variables**, add `DATABASE_URL` with the pooled Neon connection
   string from step 1.

4. **Deploy** — click Deploy (or just push to the repo; every push deploys).
   The first request creates and seeds the schema automatically.

## API

| Method | Path                 | Description                                   |
| ------ | -------------------- | --------------------------------------------- |
| GET    | `/api/flipcharts`    | List flipcharts with their location names     |
| POST   | `/api/flipcharts`    | Create a flipchart `{name, location_id, status, notes}` |
| PATCH  | `/api/flipcharts/:id`| Update any subset of the fields above         |
| DELETE | `/api/flipcharts/:id`| Delete a flipchart                            |
| GET    | `/api/locations`     | List locations with flipchart counts          |
| POST   | `/api/locations`     | Create a location `{name}`                    |
| PATCH  | `/api/locations/:id` | Rename a location                             |
| DELETE | `/api/locations/:id` | Delete a location (flipcharts become unassigned) |

Statuses: `available`, `in-use`, `needs-supplies`.
