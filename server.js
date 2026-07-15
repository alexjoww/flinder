'use strict';

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set.\n' +
      'Copy .env.example to .env and fill in your Postgres connection string.'
  );
  process.exit(1);
}

const app = require('./app');

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Flinder is running at http://localhost:${PORT}`);
});
