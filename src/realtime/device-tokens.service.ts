import { Injectable } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Manages FCM device tokens — the fan-out targets for background mobile push.
 * The client registers/refreshes its token on login and removes it on logout.
 */
@Injectable()
export class DeviceTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Register or refresh a device's FCM token for a user (idempotent on token). */
  async register(userId: string, token: string, platform: DevicePlatform) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { registered: true };
  }

  /** Remove a device token (on logout, or when FCM reports it unregistered). */
  async remove(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
    return { removed: true };
  }

  /** All registered tokens for a user. */
  async tokensFor(userId: string): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }
}
