# Frontend guide — onboarding real-time (React/Next.js + Flutter)

This teaches the frontend exactly what the backend exposes and how to consume
it, with copy-pasteable code. If you've read
[`realtime-how-it-works.md`](./realtime-how-it-works.md), you know the golden
rule; here it is again because it drives every line below:

> **The REST status endpoint is the truth. The realtime/push message is only a
> nudge to re-read it.** Always render from `GET /vendors/me/onboarding-status`.
> Treat a live message as "go refresh now."

---

## The contract (what the backend gives you)

**1. Source of truth — pull this:**
```
GET /vendors/me/onboarding-status
Authorization: Bearer <your app access token>
→ {
    vendorStatus, kycStatus, submittedAt, reviewedAt, rejectionReason,
    steps: [
      { key: 'account',   title: 'Account created',     status: 'done' },
      { key: 'documents', title: 'Documents submitted', status: 'done'|'active' },
      { key: 'review',    title: 'Admin review',        status: 'pending'|'active'|'done'|'rejected' },
      { key: 'approved',  title: 'Store approved',      status: 'pending'|'done' }
    ]
  }
```

**2. Realtime auth token — fetch before subscribing:**
```
GET /realtime/token
Authorization: Bearer <your app access token>
→ { token: "<jwt>", expiresIn: 3600 }
```

**3. Device token registration (mobile push):**
```
POST   /me/device-tokens   { token: "<fcm token>", platform: "ios"|"android"|"web" }
DELETE /me/device-tokens   { token: "<fcm token>" }      // on logout
Authorization: Bearer <your app access token>
```

**4. The live channel:**
- channel/topic: `onboarding:<userId>` (private)
- event: `step_changed`
- payload:
  ```json
  { "step": "kyc"|"store_activation", "status": "approved"|"rejected",
    "reason": "string|null", "kycId": "string|null", "occurredAt": "ISO-8601" }
  ```

`<userId>` is **your app `User.id`** (the one in your login response), not the
Supabase auth id. The realtime token from step 2 carries it as `sub`, so the
private channel authorizes correctly.

---

## React / Next.js

### Install
```bash
npm i @supabase/supabase-js
```

### 1) A Supabase client (anon key — safe in the browser)
```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Public values — fine to ship to the browser. NEVER put the service-role key here.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { realtime: { params: { eventsPerSecond: 5 } } },
);
```

### 2) A hook that does it all: pull truth + subscribe + reconcile
```ts
// hooks/useOnboardingStatus.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const API = process.env.NEXT_PUBLIC_API_URL!; // your NestJS base URL

export function useOnboardingStatus(userId: string, getAccessToken: () => string) {
  const [status, setStatus] = useState<any>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // The ONLY source of truth. Call on mount, on every realtime nudge, and on resume.
  const refetch = useCallback(async () => {
    const res = await fetch(`${API}/vendors/me/onboarding-status`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (res.ok) setStatus(await res.json());
  }, [getAccessToken]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // a) Authorize Realtime with a backend-minted token (sub = our User.id).
      const tokRes = await fetch(`${API}/realtime/token`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      const { token } = await tokRes.json();
      await supabase.realtime.setAuth(token);

      // b) Always load the truth first.
      await refetch();
      if (cancelled) return;

      // c) Subscribe to the private channel; treat any message as "go refresh".
      const channel = supabase
        .channel(`onboarding:${userId}`, { config: { private: true } })
        .on('broadcast', { event: 'step_changed' }, () => {
          // You could merge payload directly, but re-pulling keeps truth simple.
          refetch();
        })
        .subscribe();

      channelRef.current = channel;
    })();

    // d) Re-pull when the tab regains focus (covers missed messages while hidden).
    const onVisible = () => document.visibilityState === 'visible' && refetch();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [userId, getAccessToken, refetch]);

  return { status, refetch };
}
```

### 3) Render the stepper
```tsx
function OnboardingTracker({ userId, getAccessToken }: Props) {
  const { status } = useOnboardingStatus(userId, getAccessToken);
  if (!status) return <Spinner />;
  return (
    <ol>
      {status.steps.map((s: any) => (
        <li key={s.key} data-state={s.status}>
          {s.title} {s.status === 'rejected' && status.rejectionReason
            ? `— ${status.rejectionReason}` : ''}
        </li>
      ))}
    </ol>
  );
}
```

That's the whole web integration. The token refresh (every `expiresIn` seconds)
matters only for very long-lived sessions; re-call `/realtime/token` +
`setAuth` on a timer if you keep tabs open for hours.

---

## Flutter (mobile)

Mobile needs the same live channel **plus** FCM so approvals that arrive while
the app is closed still reach the user.

### Install
```yaml
# pubspec.yaml
dependencies:
  supabase_flutter: ^2.5.0
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
  http: ^1.2.0
```

### 1) Initialize Supabase
```dart
await Supabase.initialize(
  url: const String.fromEnvironment('SUPABASE_URL'),
  anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
);
final supabase = Supabase.instance.client;
```

### 2) Authorize Realtime + subscribe to the private channel
```dart
Future<RealtimeChannel> subscribeOnboarding(String userId, String appJwt) async {
  // a) Backend-minted realtime token (sub = our User.id).
  final tokRes = await http.get(
    Uri.parse('$apiBase/realtime/token'),
    headers: {'Authorization': 'Bearer $appJwt'},
  );
  final token = jsonDecode(tokRes.body)['token'] as String;
  supabase.realtime.setAuth(token);

  // b) Load the truth first.
  await refetchOnboardingStatus(appJwt);

  // c) Subscribe; any message = "go refresh".
  final channel = supabase.channel(
    'onboarding:$userId',
    opts: const RealtimeChannelConfig(private: true),
  );
  channel.onBroadcast(
    event: 'step_changed',
    callback: (payload) => refetchOnboardingStatus(appJwt),
  ).subscribe();
  return channel;
}

Future<void> refetchOnboardingStatus(String appJwt) async {
  final res = await http.get(
    Uri.parse('$apiBase/vendors/me/onboarding-status'),
    headers: {'Authorization': 'Bearer $appJwt'},
  );
  if (res.statusCode == 200) {
    // update your state management with jsonDecode(res.body)
  }
}
```

### 3) Register the FCM token so background push works
```dart
Future<void> registerPush(String appJwt) async {
  await FirebaseMessaging.instance.requestPermission();
  final fcmToken = await FirebaseMessaging.instance.getToken();
  if (fcmToken == null) return;

  await http.post(
    Uri.parse('$apiBase/me/device-tokens'),
    headers: {
      'Authorization': 'Bearer $appJwt',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({
      'token': fcmToken,
      'platform': Platform.isIOS ? 'ios' : 'android',
    }),
  );

  // Keep it fresh when FCM rotates the token.
  FirebaseMessaging.instance.onTokenRefresh.listen((t) {
    http.post(/* same POST with the new token */);
  });
}
```

### 4) React to a push (foreground + background)
```dart
// Foreground: a push arrived while the app is open → refresh the tracker.
FirebaseMessaging.onMessage.listen((msg) {
  if (msg.data['type'] == 'onboarding') refetchOnboardingStatus(appJwt);
});

// Background/terminated: user tapped the notification → open & refresh.
FirebaseMessaging.onMessageOpenedApp.listen((msg) {
  if (msg.data['type'] == 'onboarding') {
    // navigate to the onboarding screen; it refetches on load
  }
});
```

> The backend's FCM sender is currently **scaffolded** (it logs instead of
> sending). Steps 3–4 are ready on the app side; once Firebase credentials are
> wired into the backend (`firebase-admin`), real pushes start flowing with no
> app changes.

### On logout
Call `DELETE /me/device-tokens` with the token, `supabase.removeChannel(...)`,
and clear the realtime auth.

---

## Checklist

- [ ] Run the Supabase RLS policy from `realtime-how-it-works.md` (private channel).
- [ ] Web: fetch `/realtime/token` → `setAuth` → subscribe `onboarding:<userId>`.
- [ ] Always render from `/vendors/me/onboarding-status`; refetch on nudge + resume.
- [ ] Mobile: also register the FCM token via `/me/device-tokens`.
- [ ] Never ship the Supabase **service-role** key to any client — anon key only.
