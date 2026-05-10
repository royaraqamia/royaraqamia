const webPush = require('web-push');

console.log('Generating VAPID keys for push notifications...\n');

try {
  const vapidKeys = webPush.generateVAPIDKeys();

  console.log('✅ VAPID keys generated successfully!\n');
  console.log('Add these to your .env file:\n');
  console.log(`VITE_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
  console.log(`VITE_VAPID_PRIVATE_KEY=${vapidKeys.privateKey}\n`);
  console.log('⚠️  IMPORTANT: Keep the private key secure and never commit it to version control!\n');
  console.log('You can also add these to your backend server configuration.');
} catch (error) {
  console.error('❌ Error generating VAPID keys:', error);
  process.exit(1);
}
