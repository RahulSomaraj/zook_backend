import { Injectable, Logger } from '@nestjs/common';
import { PushMessage, PushSender } from './push-sender';

/**
 * FCM implementation of PushSender — SCAFFOLD (no Firebase credentials needed
 * yet). The rest of the realtime pipeline is fully functional today; this just
 * logs the push it *would* send so the flow is observable end to end.
 *
 * To finish wiring FCM:
 *   1. `npm i firebase-admin`
 *   2. Provide a service-account credential (e.g. env FIREBASE_SERVICE_ACCOUNT
 *      holding the JSON, or GOOGLE_APPLICATION_CREDENTIALS pointing at a file)
 *      and initialise the Admin SDK once (constructor or OnModuleInit).
 *   3. Replace the body of `send()` with:
 *        const res = await admin.messaging().sendEachForMulticast({
 *          tokens, notification: { title, body }, data,
 *        });
 *   4. Inspect res.responses; for any with error code
 *      'messaging/registration-token-not-registered', prune that dead token
 *      via DeviceTokensService.remove(token).
 */
@Injectable()
export class FcmPushSender extends PushSender {
  private readonly logger = new Logger(FcmPushSender.name);

  async send(tokens: string[], message: PushMessage): Promise<void> {
    if (tokens.length === 0) return;
    // TODO(FCM): replace with firebase-admin sendEachForMulticast(...).
    this.logger.log(
      `[FCM scaffold] would push to ${tokens.length} token(s): ` +
        `"${message.title}" — "${message.body}" ` +
        `data=${JSON.stringify(message.data ?? {})}`,
    );
    return Promise.resolve();
  }
}
