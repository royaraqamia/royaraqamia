/**
 * Push Notification Backend Server
 * 
 * This is a simple Express server for managing push notification subscriptions.
 * To use this server:
 * 1. Install dependencies: npm install express cors body-parser web-push
 * 2. Run: node backend/push-server.js
 * 3. Configure frontend to use http://localhost:3001
 */

const express = require('express');
const cors = require('cors');
const webPush = require('web-push');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// VAPID Keys (load from environment variables)
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

// Validate VAPID keys are configured
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  console.error('VAPID keys not configured. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
  console.error('Generate keys using: npx web-push generate-vapid-keys');
  process.exit(1);
}

// Configure web-push
webPush.setVapidDetails(
  'mailto:contact@royaraqamia.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// In-memory storage for subscriptions (use a database in production)
const subscriptions = new Map();

// Subscribe endpoint
app.post('/api/push/subscribe', (req, res) => {
  try {
    const { subscription, userAgent, timestamp } = req.body;

    if (!subscription) {
      return res.status(400).json({ error: 'Subscription object is required' });
    }

    // Store subscription (use subscription endpoint as key)
    const subscriptionKey = subscription.endpoint;
    subscriptions.set(subscriptionKey, {
      subscription,
      userAgent,
      timestamp,
      createdAt: new Date().toISOString(),
    });

    console.log(`New subscription added: ${subscriptionKey}`);
    console.log(`Total subscriptions: ${subscriptions.size}`);

    res.status(200).json({ success: true, message: 'Subscription saved' });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// Unsubscribe endpoint
app.post('/api/push/unsubscribe', (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription endpoint is required' });
    }

    const subscriptionKey = subscription.endpoint;
    const deleted = subscriptions.delete(subscriptionKey);

    if (deleted) {
      console.log(`Subscription removed: ${subscriptionKey}`);
      console.log(`Total subscriptions: ${subscriptions.size}`);
      res.status(200).json({ success: true, message: 'Subscription removed' });
    } else {
      res.status(404).json({ error: 'Subscription not found' });
    }
  } catch (error) {
    console.error('Error removing subscription:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// Get all subscriptions (for testing/admin)
app.get('/api/push/subscriptions', (req, res) => {
  res.status(200).json({
    count: subscriptions.size,
    subscriptions: Array.from(subscriptions.values()),
  });
});

// Send push notification to all subscribers
app.post('/api/push/send', async (req, res) => {
  try {
    const { title, body, icon, url } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: icon || '/icons/icon-192x192.png',
      url: url || '/',
    });

    const results = [];
    const errors = [];

    for (const [key, data] of subscriptions.entries()) {
      try {
        await webPush.sendNotification(data.subscription, payload);
        results.push({ success: true, endpoint: key });
      } catch (error) {
        console.error(`Failed to send to ${key}:`, error);
        errors.push({ endpoint: key, error: error.message });
        // Remove invalid subscription
        subscriptions.delete(key);
      }
    }

    res.status(200).json({
      success: true,
      sent: results.length,
      failed: errors.length,
      errors,
    });
  } catch (error) {
    console.error('Error sending push notification:', error);
    res.status(500).json({ error: 'Failed to send push notification' });
  }
});

// Health check
app.get('/api/push/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    subscriptions: subscriptions.size,
    vapidConfigured: !!vapidKeys.publicKey && !!vapidKeys.privateKey,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Push notification server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/push/health`);
  console.log(`Send notification: POST http://localhost:${PORT}/api/push/send`);
});

module.exports = app;
