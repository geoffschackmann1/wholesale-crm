// Sends a Web Push notification to the stored subscription.
// Silently skips if VAPID keys or PUSH_SUBSCRIPTION are not configured.
// Full implementation in Module 4 when the service worker is set up.
import webpush from 'web-push';

export async function sendWebPush(payload: {
  title: string;
  body: string;
  url: string;
}): Promise<void> {
  const vapidPublicKey = process.env['VAPID_PUBLIC_KEY'];
  const vapidPrivateKey = process.env['VAPID_PRIVATE_KEY'];
  const vapidSubject = process.env['VAPID_SUBJECT'] ?? 'mailto:admin@example.com';
  const pushSubscriptionRaw = process.env['PUSH_SUBSCRIPTION'];

  if (!vapidPublicKey || !vapidPrivateKey || !pushSubscriptionRaw) {
    // Not configured — skip silently (the service worker handles this in Module 4)
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const subscription = JSON.parse(pushSubscriptionRaw) as webpush.PushSubscription;

  await webpush.sendNotification(
    subscription,
    JSON.stringify({ title: payload.title, body: payload.body, url: payload.url }),
  );
}
