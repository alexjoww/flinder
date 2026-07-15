'use strict';

const path = require('node:path');
const express = require('express');
const db = require('./db');

const STATUSES = ['available', 'in-use', 'needs-supplies'];

const FLIPCHART_SELECT = `
  SELECT f.id, f.name, f.status, f.notes, f.updated_at,
         f.location_id, l.name AS location_name
  FROM flipcharts f
  LEFT JOIN locations l ON l.id = f.location_id
`;

async function getFlipchart(id) {
  const { rows } = await db.query(`${FLIPCHART_SELECT} WHERE f.id = $1`, [id]);
  return rows[0];
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Route :id params reach Postgres as integers; anything else is a 404.
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Validates the location_id field of a request body. Returns
// { ok: true, value } with a normalized value (number or null),
// or { ok: false } when it references a missing location.
async function parseLocationId(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const id = parseId(raw);
  if (id === null) return { ok: false };
  const { rows } = await db.query('SELECT 1 FROM locations WHERE id = $1', [id]);
  if (rows.length === 0) return { ok: false };
  return { ok: true, value: id };
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure the schema exists (and seed data on first ever run) before any
// API query. Memoized in db.js, so this is a no-op after the first request.
app.use('/api', async (req, res, next) => {
  await db.ready();
  next();
});

// --- Flipcharts ---

app.get('/api/flipcharts', async (req, res) => {
  const { rows } = await db.query(`${FLIPCHART_SELECT} ORDER BY LOWER(f.name)`);
  res.json(rows);
});

app.post('/api/flipcharts', async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Flipchart name is required.' });

  const status = req.body.status ?? 'available';
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  const location = await parseLocationId(req.body.location_id);
  if (!location.ok) return res.status(400).json({ error: 'Unknown location.' });

  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

  try {
    const { rows } = await db.query(
      'INSERT INTO flipcharts (name, location_id, status, notes) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, location.value, status, notes]
    );
    res.status(201).json(await getFlipchart(rows[0].id));
  } catch (err) {
    if (db.isUniqueViolation(err)) {
      return res.status(409).json({ error: `A flipchart named “${name}” already exists.` });
    }
    throw err;
  }
});

app.patch('/api/flipcharts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const existing = id === null ? undefined : await getFlipchart(id);
  if (!existing) return res.status(404).json({ error: 'Flipchart not found.' });

  const fields = [];
  const values = [];

  if ('name' in req.body) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Flipchart name is required.' });
    values.push(name);
    fields.push(`name = $${values.length}`);
  }
  if ('status' in req.body) {
    if (!STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    values.push(req.body.status);
    fields.push(`status = $${values.length}`);
  }
  if ('location_id' in req.body) {
    const location = await parseLocationId(req.body.location_id);
    if (!location.ok) return res.status(400).json({ error: 'Unknown location.' });
    values.push(location.value);
    fields.push(`location_id = $${values.length}`);
  }
  if ('notes' in req.body) {
    values.push(typeof req.body.notes === 'string' ? req.body.notes.trim() : '');
    fields.push(`notes = $${values.length}`);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  fields.push('updated_at = now()');
  values.push(id);

  try {
    await db.query(
      `UPDATE flipcharts SET ${fields.join(', ')} WHERE id = $${values.length}`,
      values
    );
  } catch (err) {
    if (db.isUniqueViolation(err)) {
      return res.status(409).json({ error: 'A flipchart with that name already exists.' });
    }
    throw err;
  }
  res.json(await getFlipchart(id));
});

app.delete('/api/flipcharts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } =
    id === null ? { rowCount: 0 } : await db.query('DELETE FROM flipcharts WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Flipchart not found.' });
  res.status(204).end();
});

// --- Locations ---

app.get('/api/locations', async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.id, l.name, COUNT(f.id)::int AS flipchart_count
     FROM locations l
     LEFT JOIN flipcharts f ON f.location_id = l.id
     GROUP BY l.id
     ORDER BY LOWER(l.name)`
  );
  res.json(rows);
});

app.post('/api/locations', async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Location name is required.' });

  try {
    const { rows } = await db.query('INSERT INTO locations (name) VALUES ($1) RETURNING id', [
      name,
    ]);
    res.status(201).json({ id: rows[0].id, name, flipchart_count: 0 });
  } catch (err) {
    if (db.isUniqueViolation(err)) {
      return res.status(409).json({ error: `A location named “${name}” already exists.` });
    }
    throw err;
  }
});

app.patch('/api/locations/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Location name is required.' });

  try {
    const { rowCount } =
      id === null
        ? { rowCount: 0 }
        : await db.query('UPDATE locations SET name = $1 WHERE id = $2', [name, id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Location not found.' });
  } catch (err) {
    if (db.isUniqueViolation(err)) {
      return res.status(409).json({ error: `A location named “${name}” already exists.` });
    }
    throw err;
  }
  res.json({ ok: true });
});

// Deleting a location leaves its flipcharts unassigned (ON DELETE SET NULL).
app.delete('/api/locations/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } =
    id === null ? { rowCount: 0 } : await db.query('DELETE FROM locations WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Location not found.' });
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

module.exports = app;
