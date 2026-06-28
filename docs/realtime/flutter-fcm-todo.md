# Flutter + FCM + Supabase Realtime — Integration Checklist

Status key: ✅ done in backend  ⬜ pending

---

## 1 · Supabase setup

- [x] RLS policy on `realtime.messages` — lets clients receive on their own `onboarding:<userId>` topic
  ```sql
  create policy "receive own onboarding broadcasts"
  on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() = 'onboarding:' || auth.uid()::text);
  ```
- [ ] Confirm `SUPABASE_JWT_SECRET` is set in the backend deployment env
  - Needed by `GET /realtime/token` to mint the channel auth token
  - Find it: Supabase dashboard → Project Settings → API → JWT Secret

---

## 2 · Firebase / FCM setup

- [ ] Create a Firebase project at console.firebase.google.com (or use existing)
- [ ] Add an **Android** app to the project — package name must match your Flutter app
- [ ] Add an **iOS** app to the project — bundle ID must match your Flutter app
- [ ] Enable **Cloud Messaging** (FCM) in the Firebase console (usually auto-enabled)
- [ ] Generate a service-account key:
  - Firebase console → Project Settings → Service Accounts → "Generate new private key" → download JSON
- [ ] Minify the JSON to one line and add to backend env:
  ```bash
  jq -c . service-account.json   # copy the output
  ```
  ```env
  FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
  ```
- [ ] Re-deploy the backend — `FcmPushSender` initialises on startup and logs "Firebase Admin SDK initialized"

---

## 3 · Backend — already implemented ✅

These are **done**; no code changes needed:

| What | File | Endpoint |
|---|---|---|
| Supabase Realtime broadcast (HTTP API) | `src/realtime/supabase-realtime.service.ts` | — |
| Realtime auth token mint | `src/realtime/realtime-token.service.ts` | `GET /realtime/token` |
| Device token register/remove | `src/realtime/device-tokens.{service,controller}.ts` | `POST /me/device-tokens`, `DELETE /me/device-tokens` |
| FCM send (firebase-admin) | `src/realtime/push/fcm-push-sender.ts` | — |
| Event fan-out on KYC/store approval | `src/realtime/onboarding-notifier.service.ts` | — |
| Dead-token pruning | `FcmPushSender.send()` | automatic |
| `DeviceToken` table + migration | `prisma/migrations/20260626120000_add_device_tokens/` | — |

The only backend action left is **adding the Firebase env var** (Step 2 above).

---

## 4 · Flutter app — pending

### 4a · Packages (`pubspec.yaml`)
```yaml
dependencies:
  supabase_flutter: ^2.5.0
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
  http: ^1.2.0
```

### 4b · Platform files
- [ ] Download `google-services.json` from Firebase console → place at `android/app/google-services.json`
- [ ] Download `GoogleService-Info.plist` from Firebase console → place at `ios/Runner/GoogleService-Info.plist`
- [ ] `android/build.gradle` — add `classpath 'com.google.gms:google-services:4.4.x'`
- [ ] `android/app/build.gradle` — add `apply plugin: 'com.google.gms.google-services'`
- [ ] iOS: in Xcode enable Push Notifications capability (Signing & Capabilities → + → Push Notifications)
- [ ] iOS: upload APNs key to Firebase console (Project Settings → Cloud Messaging → Apple app → APNs Auth Key)

### 4c · App initialisation (`main.dart`)
```dart
await Firebase.initializeApp();
await Supabase.initialize(
  url: const String.fromEnvironment('SUPABASE_URL'),
  anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY'),
);
```

### 4d · After login — Realtime subscription
```dart
// 1. Get a channel auth token from your backend (sub = app User.id)
final tokRes = await http.get(
  Uri.parse('$apiBase/realtime/token'),
  headers: {'Authorization': 'Bearer $appJwt'},
);
final realtimeToken = jsonDecode(tokRes.body)['token'] as String;
Supabase.instance.client.realtime.setAuth(realtimeToken);

// 2. Always load truth first
await refetchOnboardingStatus(appJwt);

// 3. Subscribe — any broadcast = "re-pull truth"
final channel = Supabase.instance.client.channel(
  'onboarding:$userId',
  opts: const RealtimeChannelConfig(private: true),
);
channel.onBroadcast(
  event: 'step_changed',
  callback: (_) => refetchOnboardingStatus(appJwt),
).subscribe();
```

### 4e · After login — FCM device token registration
```dart
await FirebaseMessaging.instance.requestPermission();
final fcmToken = await FirebaseMessaging.instance.getToken();
if (fcmToken != null) {
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
}
// Re-register when FCM rotates the token
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
  http.post(/* same POST */);
});
```

### 4f · Handle push messages
```dart
// Foreground — app is open
FirebaseMessaging.onMessage.listen((msg) {
  if (msg.data['type'] == 'onboarding') refetchOnboardingStatus(appJwt);
});

// Background/terminated — user tapped the notification
FirebaseMessaging.onMessageOpenedApp.listen((msg) {
  if (msg.data['type'] == 'onboarding') {
    // navigate to onboarding screen; it refetches on load
  }
});

// App launched from a terminated state via notification tap
final initial = await FirebaseMessaging.instance.getInitialMessage();
if (initial != null && initial.data['type'] == 'onboarding') {
  // navigate to onboarding screen
}
```

### 4g · Logout cleanup
```dart
// Remove FCM token so no more pushes reach this install
await http.delete(
  Uri.parse('$apiBase/me/device-tokens'),
  headers: {
    'Authorization': 'Bearer $appJwt',
    'Content-Type': 'application/json',
  },
  body: jsonEncode({'token': fcmToken}),
);

// Unsubscribe from Realtime and clear auth
await Supabase.instance.client.removeChannel(channel);
Supabase.instance.client.realtime.setAuth(null);
```

---

## 5 · Broadcast payload (what Flutter receives)

Backend sends on event `step_changed` in topic `onboarding:<userId>`:
```json
{
  "step": "kyc" | "store_activation",
  "status": "approved" | "rejected",
  "reason": "string | null",
  "kycId": "string | null",
  "occurredAt": "2026-06-28T10:00:00.000Z"
}
```

FCM `data` map (for background push):
```
type     = "onboarding"
step     = "kyc" | "store_activation"
status   = "approved" | "rejected"
kycId    = "<id>" (if step is kyc)
```

Truth endpoint to always call after any nudge:
```
GET /vendors/me/onboarding-status
Authorization: Bearer <app access token>
```

---

## 6 · End-to-end smoke test

1. Log in as a vendor on Flutter → confirm `/me/device-tokens` POST returns `{ registered: true }`
2. In Supabase dashboard → Table Editor → `device_tokens` → confirm row is there
3. Keep the app open (foreground)
4. Admin approves KYC → vendor screen should update in < 1 s (Realtime broadcast)
5. Background the app
6. Admin activates store → FCM notification appears in the system tray
7. Tap notification → app opens on the onboarding screen showing "Store approved"
8. Log out → confirm `device_tokens` row is deleted
