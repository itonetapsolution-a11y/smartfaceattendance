# Face Recognition Attendance System

Browser-based attendance system. Faces are registered from the Admin Panel; the
Attendance page marks attendance automatically, but only for faces that match
a registered user (unrecognized faces are ignored).

## Run

```
npm install
npm start
```

Then open http://localhost:3000 in the browser (Chrome/Edge recommended, needs webcam permission).

## Pages

- `/admin.html` — register a person (name + webcam capture), list/delete registered users
- `/attendance.html` — live webcam recognition, marks attendance once per person per day
- `/dashboard.html` — stats + attendance log, filterable by date

## How it works

- Face detection/recognition runs in the browser via `face-api.js` (TensorFlow.js), model weights in `public/models`.
- Registering a face computes a 128-value face descriptor and stores it in SQLite (`db/attendance.db`).
- Marking attendance sends the live descriptor to the server, which compares it against every
  stored descriptor (Euclidean distance) and only records attendance if the closest match is
  within the recognition threshold — unrecognized faces never get a row. One attendance record
  per user per day (enforced by a DB unique constraint).

## Notes

- This runs on a local trusted network — the browser tells the server which user matched.
  Fine for an internal office/classroom tool, but not hardened against a malicious client.
- Delete `db/attendance.db*` to reset all data.
