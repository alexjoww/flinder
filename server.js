'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.FLINDER_DB || path.join(__dirname, 'data', 'flinder.db');

const STATUSES = ['available', 'in-use', 'needs-supplies'];

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE IF NOT EXISTS flipcharts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'available'
      CHECK (status IN ('available', 'in-use', 'needs-supplies')),
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

seedIfEmpty();

function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM locations').get();
  if (n > 0) return;

  const insertLocation = db.prepare('INSERT INTO locations (name) VALUES (?)');
  const ids = {};
  for (const name of ['Horizon Point', 'Wisteria', 'Auditorium', 'Telco', 'Lab', 'Nightcap']) {
    ids[name] = insertLocation.run(name).lastInsertRowid;
  }

  const insertFlipchart = db.prepare(
    'INSERT INTO flipcharts (name, location_id, status, notes) VALUES (?, ?, ?, ?)'
  );
  insertFlipchart.run('FC-01', ids['Auditorium'], 'available', '');
  insertFlipchart.run('FC-02', ids['Auditorium'], 'in-use', 'Reserved for the morning keynote');
  insertFlipchart.run('FC-03', ids['Horizon Point'], 'available', '');
  insertFlipchart.run('FC-04', ids['Wisteria'], 'needs-supplies', 'Out of markers');
  insertFlipchart.run('FC-05', ids['Telco'], 'in-use', '');
  insertFlipchart.run('FC-06', ids['Lab'], 'available', '');
  insertFlipchart.run('FC-07', ids['Nightcap'], 'needs-supplies', 'Running low on paper');
  insertFlipchart.run('FC-08', null, 'available', 'Spare from storage');
}

const FLIPCHART_SELECT = `
  SELECT f.id, f.name, f.status, f.notes, f.updated_at,
         f.location_id, l.name AS location_name
  FROM flipcharts f
  LEFT JOIN locations l ON l.id = f.location_id
`;

function getFlipchart(id) {
  return db.prepare(`${FLIPCHART_SELECT} WHERE f.id = ?`).get(id);
}

function isUniqueViolation(err) {
  return err instanceof Error && err.message.includes('UNIQUE constraint failed');
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function locationExists(id) {
  return db.prepare('SELECT 1 FROM locations WHERE id = ?').get(id) !== undefined;
}

// Validates the location_id field of a request body. Returns
// { ok: true, value } with a normalized value (number or null),
// or { ok: false } when it references a missing location.
function parseLocationId(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const id = Number(raw);
  if (!Number.isInteger(id) || !locationExists(id)) return { ok: false };
  return { ok: true, value: id };
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Flipcharts ---

app.get('/api/flipcharts', (req, res) => {
  res.json(db.prepare(`${FLIPCHART_SELECT} ORDER BY f.name COLLATE NOCASE`).all());
});

app.post('/api/flipcharts', (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Flipchart name is required.' });

  const status = req.body.status ?? 'available';
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  const location = parseLocationId(req.body.location_id);
  if (!location.ok) return res.status(400).json({ error: 'Unknown location.' });

  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO flipcharts (name, location_id, status, notes) VALUES (?, ?, ?, ?)')
      .run(name, location.value, status, notes);
    res.status(201).json(getFlipchart(lastInsertRowid));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: `A flipchart named “${name}” already exists.` });
    }
    throw err;
  }
});

app.patch('/api/flipcharts/:id', (req, res) => {
  const existing = getFlipchart(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Flipchart not found.' });

  const fields = [];
  const values = [];

  if ('name' in req.body) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Flipchart name is required.' });
    fields.push('name = ?');
    values.push(name);
  }
  if ('status' in req.body) {
    if (!STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    fields.push('status = ?');
    values.push(req.body.status);
  }
  if ('location_id' in req.body) {
    const location = parseLocationId(req.body.location_id);
    if (!location.ok) return res.status(400).json({ error: 'Unknown location.' });
    fields.push('location_id = ?');
    values.push(location.value);
  }
  if ('notes' in req.body) {
    fields.push('notes = ?');
    values.push(typeof req.body.notes === 'string' ? req.body.notes.trim() : '');
  }

  if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  fields.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);

  try {
    db.prepare(`UPDATE flipcharts SET ${fields.join(', ')} WHERE id = ?`).run(
      ...values,
      existing.id
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'A flipchart with that name already exists.' });
    }
    throw err;
  }
  res.json(getFlipchart(existing.id));
});

app.delete('/api/flipcharts/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM flipcharts WHERE id = ?').run(req.params.id);
  if (changes === 0) return res.status(404).json({ error: 'Flipchart not found.' });
  res.status(204).end();
});

// --- Locations ---

app.get('/api/locations', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT l.id, l.name, COUNT(f.id) AS flipchart_count
         FROM locations l
         LEFT JOIN flipcharts f ON f.location_id = l.id
         GROUP BY l.id
         ORDER BY l.name COLLATE NOCASE`
      )
      .all()
  );
});

app.post('/api/locations', (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Location name is required.' });

  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO locations (name) VALUES (?)').run(name);
    res.status(201).json({ id: Number(lastInsertRowid), name, flipchart_count: 0 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: `A location named “${name}” already exists.` });
    }
    throw err;
  }
});

app.patch('/api/locations/:id', (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Location name is required.' });

  try {
    const { changes } = db
      .prepare('UPDATE locations SET name = ? WHERE id = ?')
      .run(name, req.params.id);
    if (changes === 0) return res.status(404).json({ error: 'Location not found.' });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: `A location named “${name}” already exists.` });
    }
    throw err;
  }
  res.json({ ok: true });
});

// Deleting a location leaves its flipcharts unassigned (ON DELETE SET NULL).
app.delete('/api/locations/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
  if (changes === 0) return res.status(404).json({ error: 'Location not found.' });
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Flinder is running at http://localhost:${PORT}`);
});
