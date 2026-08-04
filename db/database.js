const path = require('path');
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

// In production (Vercel), point these at a Turso database — serverless
// functions have no persistent local disk. Locally, falls back to a plain
// SQLite file (libSQL reads/writes standard SQLite files, no server needed).
const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'attendance.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

async function get(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows[0];
}

async function all(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows;
}

async function run(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return { lastInsertRowid: Number(rs.lastInsertRowid), changes: rs.rowsAffected };
}

function isUniqueConstraintError(err) {
  return /UNIQUE constraint failed/i.test(err.message || '');
}

let migrated = null;

async function migrate() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employee_id TEXT UNIQUE,
      phone TEXT,
      descriptor TEXT NOT NULL,
      photo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, date)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const userColumns = (await all('PRAGMA table_info(users)')).map((c) => c.name);
  if (!userColumns.includes('photo')) {
    await client.execute('ALTER TABLE users ADD COLUMN photo TEXT');
  }
  if (!userColumns.includes('phone')) {
    await client.execute('ALTER TABLE users ADD COLUMN phone TEXT');
  }

  const adminCount = (await get('SELECT COUNT(*) as c FROM admin_users')).c;
  if (adminCount === 0) {
    const defaultHash = bcrypt.hashSync('admin123', 10);
    await run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
      'admin',
      defaultHash,
    ]);
    console.log('Created default admin account -> username: admin, password: admin123');
  }

  const settingDefaults = {
    geofence_lat: '25.133278058574543',
    geofence_lng: '75.82304254920568',
    geofence_radius_m: '200',
    office_start_time: '09:00',
    late_after_minutes: '15',
    half_day_after_time: '13:00',
    min_full_day_hours: '4',
  };
  for (const [key, value] of Object.entries(settingDefaults)) {
    const existing = await get('SELECT key FROM settings WHERE key = ?', [key]);
    if (!existing) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
}

// Migration runs once per warm process; every request awaits this cheap
// cached promise so cold starts on Vercel always have tables ready.
function ensureMigrated() {
  if (!migrated) migrated = migrate();
  return migrated;
}

module.exports = { get, all, run, isUniqueConstraintError, ensureMigrated };
