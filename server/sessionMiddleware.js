const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const { getDb } = require('./db');

function createSessionMiddleware() {
  const db = getDb();
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.SESSION_SECRET || 'spotiqueue-dev-session-secret';
  if (isProduction && !process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET is not set. Set it in production.');
  }

  return session({
    store: new SQLiteStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: 15 * 60 * 1000
      }
    }),
    secret,
    resave: false,
    saveUninitialized: false,
    name: 'spotiqueue.admin.sid',
    cookie: {
      // 'auto' marks the cookie Secure only when the connection actually is
      // secure, honouring trust proxy. Hardcoding true meant that reaching the
      // admin panel over plain HTTP - a LAN address, or a reverse proxy that
      // does not forward the original scheme - sent no cookie at all: sign-in
      // returned 200 and the very next request looked signed out again.
      secure: 'auto',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  });
}

module.exports = { createSessionMiddleware };
