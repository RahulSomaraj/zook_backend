/** A push notification to deliver to one or more device tokens. */
export interface PushMessage {
  title: string;
  body: string;
  /** Arbitrary string map the app reads to deep-link and/or refetch state. */
  data?: Record<string, string>;
}

/**
 * Transport-agnostic push sender. Consumers inject this abstract class as the
 * DI token; the concrete implementation (FcmPushSender) is bound in
 * RealtimeModule. Swapping providers later (APNs directly, OneSignal, etc.)
 * means changing only that binding.
 */
export abstract class PushSender {
  abstract send(tokens: string[], message: PushMessage): Promise<void>;
}
