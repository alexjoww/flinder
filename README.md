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
- **Shared data** — a small Express server backed by SQLite means everyone who
  opens the app sees the same live inventory.

## Getting started

Requires Node.js 22.5+ (uses the built-in `node:sqlite` module).

```bash
npm install
npm start
```

Then open <http://localhost:3000>. The database is created at `data/flinder.db`
on first run and seeded with the six resort locations and a few sample
flipcharts. Set `PORT` or `FLINDER_DB` to override the defaults.

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
