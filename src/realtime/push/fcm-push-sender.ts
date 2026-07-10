import * as admin from 'firebase-admin';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceTokensService } from '../device-tokens.service';
import { PushMessage, PushSender } from './push-sender';

@Injectable()
export class FcmPushSender extends PushSender implements OnModuleInit {
  private readonly logger = new Logger(FcmPushSender.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly deviceTokens: DeviceTokensService,
  ) {
    super();
  }

  onModuleInit() {
    if (admin.apps.length > 0) {
      this.enabled = true;
      return;
    }
    const raw = this.config.get<string>('firebase.serviceAccount');
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — FCM push disabled');
      return;
    }
    try {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
      this.enabled = true;
      this.logger.log('Firebase Admin SDK initialized');
    } catch (err) {
      this.logger.error(`Firebase init failed: ${(err as Error).message}`);
    }
  }

  async send(tokens: string[], message: PushMessage): Promise<void> {
    if (tokens.length === 0 || !this.enabled) return;

    const data = message.data
      ? Object.fromEntries(
          Object.entries(message.data).map(([key, value]) => [key, String(value)]),
        )
      : undefined;

    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      data,
    });

    const dead = res.responses
      .map((r, i) => ({ r, token: tokens[i] }))
      .filter(
        ({ r }) =>
          r.error?.code === 'messaging/registration-token-not-registered' ||
          r.error?.code === 'messaging/invalid-registration-token',
      )
      .map(({ token }) => token);

    if (dead.length > 0) {
      await Promise.all(dead.map((t) => this.deviceTokens.remove(t)));
      this.logger.log(`Pruned ${dead.length} dead FCM token(s)`);
    }
  }
}
