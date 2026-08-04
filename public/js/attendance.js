const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const statusEl = document.getElementById('recognitionStatus');
const activityBody = document.getElementById('activityBody');
const activityEmpty = document.getElementById('activityEmpty');

const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

let faceMatcher = null;
let lastMarkAttempt = 0;
const MARK_COOLDOWN_MS = 2500;

// Attendance can only be marked near the configured location (see Admin ->
// Settings). watchPosition keeps this fresh instead of a one-off read.
let currentPosition = null;
let locationError = null;

function startLocationWatch() {
  if (!('geolocation' in navigator)) {
    locationError = 'Geolocation is not supported by this browser.';
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      currentPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      locationError = null;
    },
    () => {
      currentPosition = null;
      locationError = 'Location permission is required to mark attendance.';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

let lastSpokenLabel = null;
let lastSpokenTime = 0;
const SPEAK_REPEAT_COOLDOWN_MS = 8000;

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function speakForLabel(label, text) {
  const now = Date.now();
  if (label === lastSpokenLabel && now - lastSpokenTime < SPEAK_REPEAT_COOLDOWN_MS) return;
  lastSpokenLabel = label;
  lastSpokenTime = now;
  speak(text);
}

async function loadModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: {}, audio: false });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

async function buildFaceMatcher() {
  const res = await fetch('/api/users/descriptors');
  const users = await res.json();

  if (users.length === 0) {
    faceMatcher = null;
    return;
  }

  const labeled = users.map(
    (u) => new faceapi.LabeledFaceDescriptors(String(u.id), [Float32Array.from(u.descriptor)])
  );
  faceMatcher = new faceapi.FaceMatcher(labeled, 0.5);
}

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.style.color =
    type === 'good' ? 'var(--good)' : type === 'bad' ? 'var(--bad)' : type === 'warn' ? 'var(--warn)' : 'var(--text-dim)';
}

// One row per user: created on check-in, check-out cell updated in place on
// every later sighting instead of adding a new row each time. Backed by the
// server (GET /api/attendance?date=) so it survives page reloads, and since
// it's always filtered to "today", it naturally empties out the next day.
const activityRows = new Map();
let currentActivityDate = todayStr();

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

function photoCell(photo, name) {
  return photo
    ? `<img src="${photo}" alt="${name}" class="thumb" />`
    : `<div class="thumb thumb-placeholder">?</div>`;
}

function setCheckIn(userId, name, photo, time) {
  activityEmpty.style.display = 'none';
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${photoCell(photo, name)}</td><td>${name}</td><td>${time}</td><td>-</td>`;
  activityBody.prepend(tr);
  activityRows.set(userId, tr);
}

function setCheckOut(userId, name, photo, checkInTime, time) {
  activityEmpty.style.display = 'none';
  let tr = activityRows.get(userId);
  if (!tr) {
    tr = document.createElement('tr');
    tr.innerHTML = `<td>${photoCell(photo, name)}</td><td>${name}</td><td>${checkInTime}</td><td>-</td>`;
    activityBody.prepend(tr);
    activityRows.set(userId, tr);
  }
  tr.children[3].textContent = time;
}

function resetActivityIfNewDay() {
  const today = todayStr();
  if (today === currentActivityDate) return;
  currentActivityDate = today;
  activityRows.clear();
  activityBody.innerHTML = '';
  activityEmpty.style.display = 'block';
}

async function loadTodayActivity() {
  const res = await fetch(`/api/attendance?date=${currentActivityDate}`);
  const rows = await res.json();

  activityRows.clear();
  activityBody.innerHTML = '';
  activityEmpty.style.display = rows.length ? 'none' : 'block';

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${photoCell(row.photo, row.name)}</td>
      <td>${row.name}</td>
      <td>${row.check_in}</td>
      <td>${row.check_out || '-'}</td>
    `;
    activityBody.prepend(tr);
    activityRows.set(row.user_id, tr);
  }
}

async function detectLoop() {
  const displaySize = { width: overlay.clientWidth, height: overlay.clientHeight };
  faceapi.matchDimensions(overlay, displaySize);

  setInterval(async () => {
    resetActivityIfNewDay();

    const detection = await faceapi
      .detectSingleFace(video, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!detection) {
      setStatus('No face detected.', 'dim');
      return;
    }

    const resized = faceapi.resizeResults(detection, displaySize);
    faceapi.draw.drawDetections(overlay, resized);

    let label = 'unknown';
    if (faceMatcher) {
      const match = faceMatcher.findBestMatch(detection.descriptor);
      label = match.label;
    }

    if (label === 'unknown') {
      setStatus('Face not recognized — not a registered user.', 'bad');
      return;
    }

    if (!currentPosition) {
      setStatus(locationError || 'Getting your location...', 'warn');
      return;
    }

    setStatus('Face recognized. Verifying attendance...', 'dim');

    const now = Date.now();
    if (now - lastMarkAttempt < MARK_COOLDOWN_MS) return;
    lastMarkAttempt = now;

    const res = await fetch('/api/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descriptor: Array.from(detection.descriptor),
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
      }),
    });
    const data = await res.json();

    if (data.status === 'checked_in') {
      setStatus(`✅ Welcome, ${data.user.name}! Checked in at ${data.time}.`, 'good');
      setCheckIn(data.user.id, data.user.name, data.user.photo, data.time);
      speakForLabel(label, `Welcome, ${data.user.name}. Checked in.`);
    } else if (data.status === 'checked_out') {
      setStatus(`ℹ️ ${data.user.name}, checked out updated at ${data.time}.`, 'warn');
      setCheckOut(data.user.id, data.user.name, data.user.photo, 'earlier today', data.time);
      speakForLabel(label, `${data.user.name}, checked out.`);
    } else if (data.status === 'outside_geofence') {
      setStatus(`❌ You are ${data.distance}m away from the allowed location. Move closer to mark attendance.`, 'bad');
      speakForLabel(label, 'You are too far from the location. Attendance not marked.');
    } else {
      setStatus('Face not recognized — not a registered user.', 'bad');
    }
  }, 700);
}

async function init() {
  startLocationWatch();
  await startCamera();
  await Promise.all([loadModels(), buildFaceMatcher(), loadTodayActivity()]);
  setStatus('Ready. Look at the camera.', 'dim');
  detectLoop();
}

init();
