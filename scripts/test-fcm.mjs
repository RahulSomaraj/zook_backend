/**
 * Sends one real FCM push, exactly like FcmPushSender does.
 *
 * Run:   node scripts/test-fcm.mjs <DEVICE_FCM_TOKEN>
 * Get <DEVICE_FCM_TOKEN> by logging into the Flutter app and copying the value
 * from FirebaseMessaging.instance.getToken() (or read it from the device_tokens
 * table for your test user).
 *
 * Needs in .env: FIREBASE_SERVICE_ACCOUNT  (the minified service-account JSON).
 */
import 'dotenv/config';
import admin from 'firebase-admin';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('Missing env: FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }

const deviceToken = process.argv[2];
if (!deviceToken) { console.error('Usage: node scripts/test-fcm.mjs <DEVICE_FCM_TOKEN>'); process.exit(1); }

let creds;
try { creds = JSON.parse(raw); }
catch (e) { console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(creds) });
console.log('✅ Firebase Admin initialized for project:', creds.project_id);

try {
  const id = await admin.messaging().send({
    token: deviceToken,
    notification: { title: 'Documents approved', body: 'Your KYC documents were approved.' },
    data: { type: 'onboarding', step: 'kyc', status: 'approved' },
  });
  console.log('✅ SENT. message id:', id);
  console.log('   Check the device — a notification should appear (background) or hit onMessage (foreground).');
} catch (e) {
  console.error('❌ Send failed:', e.code || e.message);
  if (e.code === 'messaging/registration-token-not-registered') {
    console.error('   That device token is stale/invalid — the backend would auto-prune it.');
  }
  process.exit(1);
}
