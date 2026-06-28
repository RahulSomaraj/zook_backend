import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BroadcastMessage {
  /** Channel/topic name, e.g. `onboarding:<userId>`. */
  topic: string;
  /** Event name clients filter on, e.g. `step_changed`. */
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Sends Supabase Realtime "Broadcast" messages over the stateless HTTP API.
 *
 * Using HTTP (rather than holding a websocket open from the backend) means this
 * service keeps no realtime connection — it simply POSTs a message and Supabase
 * fans it out to subscribed clients. That also sidesteps any multi-instance
 * fan-out problem: Supabase is the shared realtime layer, so we need no Redis.
 *
 * Auth uses the service-role key (server-only, never sent to clients). Channels
 * are PRIVATE, so the frontend must be authorized via RLS on `realtime.messages`
 * to subscribe to its own `onboarding:<userId>` topic.
 */
@Injectable()
export class SupabaseRealtimeService {
  private readonly logger = new Logger(SupabaseRealtimeService.name);
  private readonly url?: string;
  private readonly serviceRoleKey?: string;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('supabase.url');
    this.serviceRoleKey = this.config.get<string>('supabase.serviceRoleKey');
  }

  /**
   * Broadcast a single message to a private Realtime topic. Best-effort and
   * never throws: realtime is only an accelerator. The DB stays the source of
   * truth and the client reconciles via GET /vendors/me/onboarding-status.
   */
  async broadcast(msg: BroadcastMessage): Promise<void> {
    if (!this.url || !this.serviceRoleKey) {
      this.logger.warn(
        'Supabase url / service-role key not configured; skipping realtime broadcast',
      );
      return;
    }

    const endpoint = `${this.url.replace(/\/$/, '')}/realtime/v1/api/broadcast`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
        },
        body: JSON.stringify({
          messages: [
            {
              topic: msg.topic,
              event: msg.event,
              payload: msg.payload,
              private: true,
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(
          `Realtime broadcast to "${msg.topic}" failed: ${res.status} ${body}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Realtime broadcast to "${msg.topic}" threw: ${(err as Error).message}`,
      );
    }
  }
}
