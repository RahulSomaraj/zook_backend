import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateCustomerSettingsDto } from './dto/update-customer-settings.dto';

const customerSettingsSelect = {
  id: true,
  language: true,
} satisfies Prisma.UserSelect;

/**
 * Customer app preferences. Mirrors the vendor settings module, but the
 * customer's identity is the User row (no separate profile table), so language
 * is read/written directly on `users`.
 */
@Injectable()
export class CustomerSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    const user = await this.findUserOrThrow(userId);
    return this.toResponse(user);
  }

  async updateSettings(userId: string, dto: UpdateCustomerSettingsDto) {
    await this.findUserOrThrow(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.language !== undefined ? { language: dto.language } : {}),
      },
      select: customerSettingsSelect,
    });
    return this.toResponse(updated);
  }

  private toResponse(
    user: Prisma.UserGetPayload<{ select: typeof customerSettingsSelect }>,
  ) {
    return { language: user.language };
  }

  private async findUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: customerSettingsSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
