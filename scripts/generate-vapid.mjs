import webpush from 'web-push';

const { generateVAPIDKeys } = webpush;

const keys = generateVAPIDKeys();

console.log('VAPID key pair generated. Add these to your environment:');
console.log('');
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('');
console.log(
  'VAPID_SUBJECT must be set to a valid mailto: or https: contact URL (required by web-push).'
);
console.log('Example: VAPID_SUBJECT=mailto:contact@royaraqamia.com');
console.log('');
console.log(
  'Keep VAPID_PRIVATE_KEY secret (server-only). Never rotate keys while subscriptions exist.'
);
