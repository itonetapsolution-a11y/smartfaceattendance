const lookupSection = document.getElementById('lookupSection');
const identifierInput = document.getElementById('identifierInput');
const lookupBtn = document.getElementById('lookupBtn');
const lookupError = document.getElementById('lookupError');

const panelSection = document.getElementById('panelSection');
const studentPhoto = document.getElementById('studentPhoto');
const studentPhotoPlaceholder = document.getElementById('studentPhotoPlaceholder');
const studentName = document.getElementById('studentName');
const studentId = document.getElementById('studentId');

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const recognitionStatus = document.getElementById('recognitionStatus');
const markBtn = document.getElementById('markBtn');
const switchUserBtn = document.getElementById('switchUserBtn');
const myCheckIn = document.getElementById('myCheckIn');
const myCheckOut = document.getElementById('myCheckOut');

const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

let student = null;
let cameraStarted = false;
let mediaStream = null;

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  window.speechSynthesis.speak(utterance);
}

function setStatus(text, type) {
  recognitionStatus.textContent = text;
  recognitionStatus.style.color =
    type === 'good' ? 'var(--good)' : type === 'bad' ? 'var(--bad)' : type === 'warn' ? 'var(--warn)' : 'var(--text-dim)';
}

async function loadModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
}

async function startCamera() {
  mediaStream = await navigator.mediaDevices.getUserMedia({ video: {}, audio: false });
  video.srcObject = mediaStream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  cameraStarted = false;
}

function drawBoxLoop() {
  const displaySize = { width: overlay.clientWidth, height: overlay.clientHeight };
  faceapi.matchDimensions(overlay, displaySize);

  setInterval(async () => {
    if (!cameraStarted) return;
    const detection = await faceapi.detectSingleFace(video, detectorOptions);
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (detection) {
      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawDetections(overlay, resized);
    }
  }, 300);
}

async function ensureCameraReady() {
  if (cameraStarted) return;
  await startCamera();
  await loadModels();
  cameraStarted = true;
  markBtn.disabled = false;
  setStatus('Ready. Position your face and click "Mark My Attendance".', 'dim');
  drawBoxLoop();
}

async function loadTodayStatus() {
  const res = await fetch(`/api/students/status/${student.id}`);
  const row = await res.json();
  myCheckIn.textContent = row.check_in || '-';
  myCheckOut.textContent = row.check_out || '-';
}

lookupBtn.addEventListener('click', async () => {
  const identifier = identifierInput.value.trim();
  lookupError.textContent = '';
  if (!identifier) {
    lookupError.textContent = 'Please enter your mobile number or employee ID.';
    return;
  }

  lookupBtn.disabled = true;
  const res = await fetch('/api/students/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  const data = await res.json();
  lookupBtn.disabled = false;

  if (!res.ok) {
    lookupError.textContent = data.error || 'Student not found.';
    return;
  }

  student = data;
  studentName.textContent = student.name;
  studentId.textContent = student.employeeId ? `ID: ${student.employeeId}` : '';
  if (student.photo) {
    studentPhoto.src = student.photo;
    studentPhoto.style.display = 'block';
    studentPhotoPlaceholder.style.display = 'none';
  } else {
    studentPhoto.style.display = 'none';
    studentPhotoPlaceholder.style.display = 'flex';
  }

  lookupSection.style.display = 'none';
  panelSection.style.display = 'block';

  await ensureCameraReady();
  loadTodayStatus();
});

identifierInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') lookupBtn.click();
});

markBtn.addEventListener('click', async () => {
  markBtn.disabled = true;
  setStatus('Detecting your face...', 'dim');

  const detection = await faceapi
    .detectSingleFace(video, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    setStatus('No face detected. Make sure your face is clearly visible and try again.', 'bad');
    markBtn.disabled = false;
    return;
  }

  const res = await fetch('/api/students/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: student.id, descriptor: Array.from(detection.descriptor) }),
  });
  const data = await res.json();

  if (data.status === 'checked_in') {
    setStatus(`✅ Checked in at ${data.time}.`, 'good');
    speak(`Welcome, ${student.name}. Checked in.`);
    myCheckIn.textContent = data.time;
  } else if (data.status === 'checked_out') {
    setStatus(`ℹ️ Checked out updated at ${data.time}.`, 'warn');
    speak(`${student.name}, checked out.`);
    myCheckOut.textContent = data.time;
  } else if (data.status === 'face_mismatch') {
    setStatus('❌ This face does not match this ID. Attendance not marked.', 'bad');
    speak('Face does not match this ID. Attendance not marked.');
  } else {
    setStatus(data.error || 'Something went wrong.', 'bad');
  }

  markBtn.disabled = false;
});

switchUserBtn.addEventListener('click', () => {
  stopCamera();
  student = null;
  identifierInput.value = '';
  lookupError.textContent = '';
  panelSection.style.display = 'none';
  lookupSection.style.display = 'block';
  markBtn.disabled = true;
});
