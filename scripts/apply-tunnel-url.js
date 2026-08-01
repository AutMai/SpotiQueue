#!/usr/bin/env node
/**
 * Point the guest QR at a URL.
 *
 * Writes straight into the config table rather than going through the admin API,
 * so it needs no password and can run unattended at boot. The server reads
 * queue_url on every request, so this takes effect immediately - no restart.
 *
 *   node scripts/apply-tunnel-url.js https://something.trycloudflare.com
 */
const path = require('path');
const Database = require('better-sqlite3');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const raw = (process.argv[2] || '').trim();
if (!/^https?:\/\//i.test(raw)) {
  console.error('Usage: node scripts/apply-tunnel-url.js <https://...>');
  process.exit(1);
}
const url = raw.replace(/\/+$/, '');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'queue.db');
let db;
try {
  db = new Database(dbPath);
} catch (error) {
  console.error(`Could not open the database at ${dbPath}: ${error.message}`);
  process.exit(1);
}

try {
  const updated = db.prepare(
    "UPDATE config SET value = ?, updated_at = strftime('%s','now') WHERE key = 'queue_url'"
  ).run(url);
  if (updated.changes === 0) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('queue_url', url);
  }

  const room = db.prepare('SELECT code FROM rooms WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  console.log(`Queue URL  : ${url}`);
  if (room) {
    console.log(`Guests join: ${url}/?room=${room.code}`);
  } else {
    console.log('No active room yet; one is created when the server starts.');
  }
} finally {
  db.close();
}
