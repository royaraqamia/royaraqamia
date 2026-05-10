// Custom Service Worker for Push Notifications
// This file extends the auto-generated service worker from vite-plugin-pwa

// Listen for push events
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  try {
    const data = event.data.json();
    const { title, body, icon, url } = data;

    const options = {
      body: body,
      icon: icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [200, 100, 200],
      data: {
        url: url || '/',
        timestamp: Date.now(),
      },
      requireInteraction: true,
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('Error handling push event:', error);
  }
});

// Listen for notification click events
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if a client is already open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // If no client is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Handle subscription expiration
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription.applicationServerKey,
    })
    .then((subscription) => {
      // Send new subscription to backend
      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          timestamp: Date.now(),
        }),
      });
    })
    .catch((error) => {
      console.error('Failed to renew subscription:', error);
    })
  );
});
