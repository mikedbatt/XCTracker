// ── Firebase Cloud Messaging service worker ─────────────────────────────────
// Handles web push notifications when the app is in the background or closed.
// Foreground messages are handled by utils/webPush.js via onMessage().
//
// Config values are passed in via the registration URL's query string so we
// don't have to duplicate firebaseConfig values across two files. See the
// service worker registration in utils/webPush.js.

importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js');

const params = new URL(location).searchParams;
firebase.initializeApp({
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  projectId:         params.get('projectId'),
  storageBucket:     params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId'),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(title || 'TeamBase', {
    body: body || '',
    icon: '/favicon.png',
    data,
  });
});

// Focus / open the app when the user clicks the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clientsList.find(c => 'focus' in c);
    if (existing) return existing.focus();
    return clients.openWindow('/');
  })());
});
