// ── callFunction ─────────────────────────────────────────────────────────────
// POST to one of our HTTP Cloud Functions with the signed-in user's Firebase
// ID token (the functions verify it). Throws an Error carrying the server's
// user-facing message on failure. (Garmin calls go through garminConfig.js.)

const FUNCTIONS_BASE = 'https://us-central1-xctracker-a2532.cloudfunctions.net';

export async function callFunction(name, body = {}) {
  const { auth } = await import('../firebaseConfig');
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in, then try again.');
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
