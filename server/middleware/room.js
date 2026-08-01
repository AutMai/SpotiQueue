const { roomsEnabled, getActiveRoom } = require('../utils/rooms');
const { getConfig } = require('../utils/config');
const { getDb } = require('../db');

const ROOM_COOKIE = 'room_code';
const ROOM_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // A room rarely outlives one event

/**
 * Where a guest's room code can come from, in priority order: an explicit code
 * on this request (fresh QR scan) beats the cookie left over from an earlier one.
 */
function readRoomCode(req) {
  const raw = req.body?.room || req.query?.room || req.cookies?.[ROOM_COOKIE];
  return typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : null;
}

/**
 * Resolve which room this request belongs to.
 *
 * Returns { ok, room, code, reason }. `reason` is 'rooms_disabled' when the
 * feature is off, 'no_room' when none exists yet, 'room_required' when the guest
 * presented nothing, and 'room_invalid' when they presented a closed room's code.
 */
function resolveGuestRoom(req) {
  if (!roomsEnabled()) {
    return { ok: true, room: null, code: null, reason: 'rooms_disabled' };
  }

  const active = getActiveRoom();
  if (!active) {
    return { ok: false, room: null, code: null, reason: 'no_room' };
  }

  const code = readRoomCode(req);
  if (!code) {
    return { ok: false, room: active, code: null, reason: 'room_required' };
  }
  if (code !== active.code) {
    return { ok: false, room: active, code, reason: 'room_invalid' };
  }
  return { ok: true, room: active, code, reason: null };
}

function roomErrorResponse(res, resolution) {
  const messages = {
    no_room: 'No room is open right now. Ask the host to start one.',
    room_required: 'Scan the QR code shown by the host to join this room.',
    room_invalid: 'This room has been closed. Scan the new QR code to keep queueing.'
  };
  return res.status(403).json({
    error: messages[resolution.reason] || 'This room is not available.',
    room_error: resolution.reason
  });
}

/** Guard for guest write endpoints. Attaches req.room on success. */
function requireRoom(req, res, next) {
  const resolution = resolveGuestRoom(req);
  if (!resolution.ok) {
    return roomErrorResponse(res, resolution);
  }
  req.room = resolution.room;
  return next();
}

/**
 * Block guests the host has not admitted yet.
 *
 * Runs after requireRoom: holding the room code gets you as far as the waiting
 * screen, being approved is what lets you act.
 */
function requireApprovedGuest(req, res, next) {
  if (getConfig('require_join_approval') !== 'true') return next();

  const fingerprintId = req.body?.fingerprint_id || req.query?.fingerprint_id || req.cookies?.fingerprint_id;
  if (!fingerprintId) {
    return res.status(403).json({ error: 'Join the room first.', approval_status: 'pending' });
  }

  const row = getDb().prepare('SELECT approval_status FROM fingerprints WHERE id = ?').get(fingerprintId);
  const status = row?.approval_status || 'pending';

  if (status === 'approved') return next();

  return res.status(403).json({
    error: status === 'denied'
      ? 'The host did not let you in.'
      : 'Waiting for the host to let you in.',
    approval_status: status
  });
}

function setRoomCookie(res, code) {
  res.cookie(ROOM_COOKIE, code, {
    httpOnly: true,
    maxAge: ROOM_COOKIE_MAX_AGE,
    sameSite: 'lax'
  });
}

module.exports = {
  ROOM_COOKIE,
  readRoomCode,
  resolveGuestRoom,
  roomErrorResponse,
  requireRoom,
  requireApprovedGuest,
  setRoomCookie
};
