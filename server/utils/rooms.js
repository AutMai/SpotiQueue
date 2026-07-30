const crypto = require('crypto');
const { getDb } = require('../db');
const { getConfig } = require('./config');

// Ambiguous glyphs (0/O, 1/I/L) are excluded so a code stays readable if
// someone has to type it in instead of scanning the QR.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function roomsEnabled() {
  return getConfig('rooms_enabled') !== 'false';
}

function getActiveRoom() {
  return getDb().prepare('SELECT * FROM rooms WHERE active = 1 ORDER BY id DESC LIMIT 1').get() || null;
}

/**
 * Close the current room and open a fresh one.
 *
 * Everything a troll could have built up in the old room is cleared in the same
 * transaction: their pending approval backlog, their votes, and the cooldowns
 * that would otherwise punish honest guests who just rescanned the new QR.
 * Tracks already handed to Spotify cannot be recalled - the Web API has no
 * remove-from-queue - so those keep playing.
 */
function createRoom() {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const rotate = db.transaction(() => {
    db.prepare('UPDATE rooms SET active = 0, closed_at = ? WHERE active = 1').run(now);

    let code;
    let room;
    // UNIQUE on code makes a collision a retryable error rather than a silent clash.
    for (let attempt = 0; attempt < 10; attempt++) {
      code = generateCode();
      try {
        const info = db.prepare('INSERT INTO rooms (code, active, created_at) VALUES (?, 1, ?)').run(code, now);
        room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(info.lastInsertRowid);
        break;
      } catch (error) {
        if (!error.message?.includes('UNIQUE')) throw error;
      }
    }
    if (!room) throw new Error('Could not allocate a unique room code');

    // Drop the moderation backlog. Kept as 'declined' rather than deleted so the
    // stats and per-device history stay intact.
    db.prepare(`
      UPDATE prequeue SET status = 'declined', approved_by = 'room-rotation'
      WHERE status = 'pending'
    `).run();

    // Anything still inside its grace period never reaches Spotify.
    db.prepare(`UPDATE pending_queues SET status = 'cancelled' WHERE status = 'pending'`).run();

    db.prepare('UPDATE fingerprints SET cooldown_expires = NULL').run();
    db.prepare('DELETE FROM votes').run();

    return room;
  });

  return rotate();
}

/** The active room, creating one on first use so a fresh install is never roomless. */
function ensureActiveRoom() {
  return getActiveRoom() || createRoom();
}

function getRoomByCode(code) {
  if (!code || typeof code !== 'string') return null;
  return getDb().prepare('SELECT * FROM rooms WHERE code = ?').get(code.trim().toUpperCase()) || null;
}

function getBaseQueueUrl() {
  return (getConfig('queue_url') || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Base queue URL with ?room=CODE applied, preserving any query the base already has. */
function buildRoomUrl(code, baseUrl) {
  const base = (baseUrl || getBaseQueueUrl()).trim();
  if (!code) return base;
  try {
    const url = new URL(base);
    url.searchParams.set('room', code);
    return url.toString();
  } catch {
    // Not a parseable absolute URL (e.g. a bare host typed into config)
    return `${base}${base.includes('?') ? '&' : '?'}room=${encodeURIComponent(code)}`;
  }
}

module.exports = {
  roomsEnabled,
  getActiveRoom,
  ensureActiveRoom,
  createRoom,
  getRoomByCode,
  getBaseQueueUrl,
  buildRoomUrl
};
