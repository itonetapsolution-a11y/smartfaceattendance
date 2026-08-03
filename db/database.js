const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

// DB_PATH lets a hosting platform point this at a mounted persistent volume
// (e.g. Railway/Render disks) instead of the ephemeral app directory.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'attendance.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    employee_id TEXT UNIQUE,
    phone TEXT,
    descriptor TEXT NOT NULL,
    photo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT NOT NULL,
    check_out TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
  );
`);

// Migrate older DBs that used a single `time` column instead of check_in/check_out.
const columns = db.prepare("PRAGMA table_info(attendance)").all().map((c) => c.name);
if (columns.includes('time') && !columns.includes('check_in')) {
  db.exec(`
    ALTER TABLE attendance RENAME TO attendance_old;

    CREATE TABLE attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, date)
    );

    INSERT INTO attendance (id, user_id, date, check_in, check_out)
      SELECT id, user_id, date, time, NULL FROM attendance_old;

    DROP TABLE attendance_old;
  `);
}

// Migrate older DBs that don't have the users.photo column yet.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes('photo')) {
  db.exec('ALTER TABLE users ADD COLUMN photo TEXT');
}
if (!userColumns.includes('phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
}

// Seed a default admin account on first run. Change the password after logging in
// by updating this row (no UI for it yet — ask to add one if you want it).
const adminCount = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
if (adminCount === 0) {
  const defaultHash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(
    'admin',
    defaultHash
  );
  console.log('Created default admin account -> username: admin, password: admin123');
}

module.exports = db;
