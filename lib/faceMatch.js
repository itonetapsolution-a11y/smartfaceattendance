// Faces closer than this Euclidean distance are considered the same person.
// face-api.js's recognition net is tuned around this default threshold.
const MATCH_THRESHOLD = 0.5;

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

module.exports = { MATCH_THRESHOLD, euclideanDistance };
