/**
 * End-to-end test of the Supabase Realtime path.
 *
 * It does exactly what the app does:
 *   1. mints a realtime token (sub = a test User.id), signed with SUPABASE_JWT_SECRET
 *   2. opens a Supabase client with the ANON key and setAuth(token)
 *   3. subscribes to the PRIVATE channel  onboarding:<testUserId>
 *   4. POSTs a broadcast via the service-role key (same as the backend)
 *   5. confirms the message is received  → proves token + RLS + broadcast all work
 *
 * Run:   node scripts/test-realtime.mjs
 * Needs in .env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *                SUPABASE_JWT_SECRET
 * And the RLS policy on realtime.messages must be applied (see flutter-fcm-todo.md §1).
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

// Node < 21 has no global WebSocket; fall back to the `ws` package.
let WS = globalThis.WebSocket;
if (!WS) {
  try { WS = (await import('ws')).WebSocket; }
  catch { console.error('No WebSocket. Run: npm i -D ws'); process.exit(1); }
}

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

// Must be a valid UUID: the RLS policy casts auth.uid() to uuid, so a non-uuid
// sub makes the policy error out and deny. Real User.id values are uuids.
const TEST_USER_ID = '00000000-0000-0000-0000-000000000000';
const topic = `onboarding:${TEST_USER_ID}`;

// 1) mint the realtime token exactly like RealtimeTokenService does
const token = jwt.sign(
  { sub: TEST_USER_ID, role: 'authenticated', aud: 'authenticated' },
  SUPABASE_JWT_SECRET,
  { expiresIn: '60m' },
);

// 2) client with anon key + the minted token
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { transport: WS, params: { eventsPerSecond: 5 } },
});
supabase.realtime.setAuth(token);

const fail = setTimeout(() => {
  console.error('\n❌ TIMEOUT — no message received in 15s.');
  console.error('   Likely causes: RLS policy not applied, wrong JWT secret, or topic mismatch.');
  process.exit(1);
}, 15000);

// 3) subscribe to the private channel
const channel = supabase.channel(topic, { config: { private: true } });
channel
  .on('broadcast', { event: 'step_changed' }, (msg) => {
    clearTimeout(fail);
    console.log('\n✅ RECEIVED broadcast:', JSON.stringify(msg.payload));
    console.log('   Realtime path works: token + RLS + private channel + broadcast.');
    process.exit(0);
  })
  .subscribe(async (status, err) => {
    console.log('channel status:', status, err ? `(${err.message})` : '');
    if (status === 'SUBSCRIBED') {
      // 4) broadcast via service role (same call the backend makes)
      const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ messages: [{ topic, event: 'step_changed', private: true, payload: { step: 'kyc', status: 'approved', occurredAt: new Date().toISOString() } }] }),
      });
      console.log('broadcast POST →', res.status, res.statusText);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      clearTimeout(fail);
      console.error('\n❌ Subscribe failed — token or RLS policy problem.');
      process.exit(1);
    }
  });
