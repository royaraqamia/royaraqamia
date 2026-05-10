/**
 * Push Notification Infrastructure
 * 
 * This file contains the infrastructure for push notifications using Supabase.
 * 
 * Setup Instructions:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Run the SQL migration in supabase/migrations/001_create_push_subscriptions.sql
 * 3. Add Supabase credentials to .env file
 * 4. Deploy the Edge Function in supabase/functions/send-push-notification/
 */

import { supabase } from '@/lib/supabase';

// VAPID keys configuration
const vapidKeys = {
  publicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY as string,
  privateKey: import.meta.env.VITE_VAPID_PRIVATE_KEY as string,
};

// Check if push notifications are configured
export const isPushNotificationsConfigured = () => {
  return !!(vapidKeys.publicKey && vapidKeys.privateKey);
};

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return 'denied';
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

// Subscribe user to push notifications
export async function subscribeToPushNotifications(
  serviceWorkerRegistration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  if (!isPushNotificationsConfigured()) {
    console.warn('Push notifications not configured. Please set VAPID keys.');
    return null;
  }

  try {
    const applicationServerKey = urlBase64ToUint8Array(vapidKeys.publicKey);
    const subscription = await serviceWorkerRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as any,
    });

    // Send subscription to your backend
    await sendSubscriptionToBackend(subscription);

    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return null;
  }
}

// Send subscription to backend
async function sendSubscriptionToBackend(subscription: PushSubscription) {
  try {
    console.log('Attempting to save subscription to Supabase...');
    console.log('Subscription endpoint:', subscription.endpoint);
    console.log('Subscription keys:', subscription.toJSON().keys);

    // Get current user if authenticated
    const { data: { user } } = await supabase.auth.getUser();

    // Try to save to Supabase
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
        user_agent: navigator.userAgent,
        user_id: user?.id || null,
        is_active: true,
      }, {
        onConflict: 'endpoint',
      });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log('Subscription saved to Supabase successfully:', data);
  } catch (error) {
    console.warn('Failed to save subscription to Supabase, using localStorage fallback:', error);
    // Fallback to localStorage if Supabase is not available
    localStorage.setItem('pushSubscription', JSON.stringify(subscription));
  }
}

// Get current subscription
export async function getCurrentSubscription(
  serviceWorkerRegistration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    return await serviceWorkerRegistration.pushManager.getSubscription();
  } catch (error) {
    console.error('Failed to get current subscription:', error);
    return null;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPushNotifications(
  subscription: PushSubscription
): Promise<void> {
  try {
    await subscription.unsubscribe();
    // Notify backend to remove subscription
    await removeSubscriptionFromBackend(subscription);
    localStorage.removeItem('pushSubscription');
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
  }
}

async function removeSubscriptionFromBackend(subscription: PushSubscription) {
  try {
    // Try to remove from Supabase
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('endpoint', subscription.endpoint);

    if (error) {
      throw error;
    }

    console.log('Subscription deactivated in Supabase successfully');
  } catch (error) {
    console.warn('Failed to deactivate subscription in Supabase:', error);
  }
}

// Check if user is subscribed
export async function isUserSubscribed(
  serviceWorkerRegistration: ServiceWorkerRegistration
): Promise<boolean> {
  const subscription = await getCurrentSubscription(serviceWorkerRegistration);
  return subscription !== null;
}

// Get VAPID public key for UI display
export function getVapidPublicKey(): string | null {
  return vapidKeys.publicKey || null;
}
