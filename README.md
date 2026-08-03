# Face Recognition Attendance System

Browser-based attendance system. Faces are registered from the Admin panel;
attendance is marked automatically, but only for faces that match a
registered user (unrecognized faces are ignored, and the Student Panel does
1:1 face verification so nobody can mark attendance under someone else's ID).

## Run locally

```
npm install
npm start
```

Then open http://localhost:3000 in the browser (Chrome/Edge recommended, needs webcam permission).
Locally the database is a plain SQLite file at `db/attendance.db` — no setup needed.

## Pages

- `/attendance.html` — public, no login. Live webcam recognition matches against everyone
  registered (N:1) and marks attendance once per person per day (check-in, then check-out
  keeps updating on later sightings). Voice feedback on match.
- `/student.html` — public, no login. A student enters their mobile number or employee ID,
  then verifies with their own face (1:1 match against only that ID's stored face) to mark
  their own attendance — never anyone else's.
- `/admin.html` — login required (default `admin` / `admin123`, change this — see below).
  Tabs: **Registration** (webcam or photo-upload face capture, edit/delete users),
  **Dashboard** (today's stats + log), **Reports** (daily/weekly/monthly/custom, Excel export).

## How it works

- Face detection/recognition runs in the browser via `face-api.js`, model weights in `public/models`.
- Registering a face computes a 128-value descriptor, stored server-side alongside name/employee
  ID/phone/photo.
- Attendance marking sends the live descriptor to the server, which does the actual
  matching/verification (never trusts the browser's opinion of who it is) and only ever writes
  a row for a face within the recognition threshold.
- Admin auth is a JWT in an httpOnly cookie (see `routes/auth.js`) — stateless, so it works the
  same on a long-running server or a serverless deployment.

## Deploying (free) — Vercel + Turso

This app is serverless-ready: the database layer (`db/database.js`) uses `@libsql/client`, which
talks to a local file locally and to a [Turso](https://turso.tech) database in production, and
auth is JWT/cookie-based instead of in-memory sessions — both were the two things that don't
work on serverless platforms otherwise.

1. **Create a free Turso database**: sign up at turso.tech, then either via their web dashboard
   or CLI (`turso db create face-attendance`, `turso db show face-attendance --url`,
   `turso db tokens create face-attendance`) get a `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
2. **Push this repo to GitHub** (already done if you're reading this from there).
3. **Import the repo on [vercel.com](https://vercel.com)** → New Project → pick the repo →
   Deploy (no build config needed, `vercel.json` handles routing).
4. **Set environment variables** in the Vercel project settings:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `JWT_SECRET` — any long random string
5. Redeploy after adding env vars. First request creates tables and the default admin
   account automatically.

## First thing to do after deploying: change the admin password

There's no "change password" UI yet — update it directly against the database (Turso web
shell, or `turso db shell <name>`):

```sql
-- generate a bcrypt hash for your new password first (e.g. via https://bcrypt-generator.com,
-- 10 rounds), then:
UPDATE admin_users SET password_hash = '<new-bcrypt-hash>' WHERE username = 'admin';
```

## Notes

- Every attendance decision (N:1 match, 1:1 verification, threshold check) happens server-side —
  the browser only sends face descriptors, never a claimed identity that's blindly trusted.
- To reset local data: delete `db/attendance.db*`. In production: drop/recreate the Turso database.
