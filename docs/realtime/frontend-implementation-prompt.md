# Frontend implementation prompt — onboarding real-time

Paste the block below into your frontend AI assistant (or hand it to a frontend
dev). It's self-contained. Fill in the two bracketed specifics if you have them.

---

You are implementing **real-time onboarding-approval updates** in our vendor
apps. Web is **React/Next.js**; mobile is **Flutter**. The backend is already
built; do not change it — consume its contract.

## Golden rule (non-negotiable)
The REST status endpoint is the **source of truth**. Realtime/push messages are
only a **nudge** to re-read it. Always render the tracker from the REST response.
On every realtime message, on app launch, and on resume/reconnect, re-fetch the
status. A missed message must never leave the UI wrong.

## Backend contract
Base URL: `[YOUR_API_BASE_URL]`. All calls send `Authorization: Bearer <app access token>`.

1. **Status (truth)** — `GET /vendors/me/onboarding-status` →
   ```json
   { "vendorStatus": "...", "kycStatus": "...", "rejectionReason": "string|null",
     "steps": [ { "key": "...", "title": "...", "status": "done|active|pending|rejected" } ] }
   ```
2. **Realtime auth token** — `GET /realtime/token` → `{ "token": "<jwt>", "expiresIn": 3600 }`.
   Call this, then `supabase.realtime.setAuth(token)` BEFORE subscribing. The
   token's identity equals our app `User.id`, which authorizes the private channel.
3. **Device token (mobile push)** — `POST /me/device-tokens`
   `{ "token": "<fcm token>", "platform": "ios"|"android"|"web" }`; remove via
   `DELETE /me/device-tokens` `{ "token": "..." }` on logout.
4. **Live channel** (Supabase Realtime Broadcast):
   - channel/topic: `onboarding:<userId>` where `<userId>` is our app `User.id`
   - event: `step_changed`
   - payload: `{ step: "kyc"|"store_activation", status: "approved"|"rejected",
     reason: string|null, kycId: string|null, occurredAt: ISO-8601 }`
   - the channel is **private**.

Supabase project values for the client: `SUPABASE_URL` and the **anon** key only
(never the service-role key). Use `@supabase/supabase-js` (web) /
`supabase_flutter` (mobile).

## What to build

### Web (React/Next.js)
- A `useOnboardingStatus(userId, getAccessToken)` hook that:
  1. fetches `/realtime/token` and calls `supabase.realtime.setAuth(token)`,
  2. fetches `/vendors/me/onboarding-status` (initial truth),
  3. subscribes to `supabase.channel('onboarding:'+userId, { config: { private: true } })`
     and on `broadcast` event `step_changed` re-fetches the status,
  4. re-fetches on `visibilitychange` → visible,
  5. cleans up the channel on unmount, and re-auths when the token nears expiry.
- An `OnboardingTracker` component rendering `steps` (show `rejectionReason` on a
  rejected step).

### Mobile (Flutter)
- Initialize `supabase_flutter`.
- A subscribe routine mirroring the web hook (token → setAuth → fetch status →
  subscribe private channel → on `step_changed` re-fetch).
- FCM via `firebase_messaging`: request permission, get token, `POST` it to
  `/me/device-tokens`, and re-`POST` on `onTokenRefresh`.
- Handle `FirebaseMessaging.onMessage` (foreground) and `onMessageOpenedApp`
  (tap) for `data.type == 'onboarding'` → refresh the tracker.
- On logout: `DELETE /me/device-tokens`, remove the channel, clear realtime auth.

## Acceptance criteria
- Approving/rejecting KYC (or activating the store) updates the vendor's tracker
  **without a manual refresh** when the app is open.
- Killing the websocket (airplane mode → back) and returning still shows the
  correct state via the resume re-fetch.
- With the app closed, the device is registered for push (a notification will
  arrive once the backend's FCM credentials are live — already scaffolded).
- The service-role key never appears in client code.
- Status is always rendered from the REST endpoint, never solely from a message.

Notes: `[ANY APP-SPECIFIC STATE/NAV DETAILS]`.
