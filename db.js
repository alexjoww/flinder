'use strict';

const { Pool } = require('pg');

// Works with any Postgres, including Neon. For Neon on Vercel, use the
// pooled connection string (the "-pooler" host) so serverless instances
// don't exhaust direct connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS locations_name_key ON locations (LOWER(name));

  CREATE TABLE IF NOT EXISTS flipcharts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'available'
      CHECK (status IN ('available', 'in-use', 'needs-supplies')),
    notes TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS flipcharts_name_key ON flipcharts (LOWER(name));
`;

const SEED_LOCATIONS = ['Horizon Point', 'Wisteria', 'Auditorium', 'Telco', 'Lab', 'Nightcap'];

const SEED_FLIPCHARTS = [
  ['FC-01', 'Auditorium', 'available', ''],
  ['FC-02', 'Auditorium', 'in-use', 'Reserved for the morning keynote'],
  ['FC-03', 'Horizon Point', 'available', ''],
  ['FC-04', 'Wisteria', 'needs-supplies', 'Out of markers'],
  ['FC-05', 'Telco', 'in-use', ''],
  ['FC-06', 'Lab', 'available', ''],
  ['FC-07', 'Nightcap', 'needs-supplies', 'Running low on paper'],
  ['FC-08', null, 'available', 'Spare from storage'],
];

function isUniqueViolation(err) {
  return err?.code === '23505';
}

async function init() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);

    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM locations');
    if (rows[0].n > 0) return;

    await client.query('BEGIN');
    try {
      const ids = {};
      for (const name of SEED_LOCATIONS) {
        const result = await client.query(
          'INSERT INTO locations (name) VALUES ($1) RETURNING id',
          [name]
        );
        ids[name] = result.rows[0].id;
      }
      for (const [name, locationName, status, notes] of SEED_FLIPCHARTS) {
        await client.query(
          'INSERT INTO flipcharts (name, location_id, status, notes) VALUES ($1, $2, $3, $4)',
          [name, locationName ? ids[locationName] : null, status, notes]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // A concurrent cold start may have seeded first; that's fine.
      if (!isUniqueViolation(err)) throw err;
    }
  } finally {
    client.release();
  }
}

// Memoize schema/seed setup so it runs once per server instance, but let a
// failed attempt be retried on the next request instead of caching the error.
let readyPromise = null;
function ready() {
  readyPromise ??= init().catch((err) => {
    readyPromise = null;
    throw err;
  });
  return readyPromise;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  ready,
  isUniqueViolation,
};
