import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    const vendor = await this.findVendorOrThrow(userId);
    return {
      language: vendor.language,
      currency: vendor.currency,
    };
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const vendor = await this.findVendorOrThrow(userId);
    const updated = await this.prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        language: dto.language,
        currency: dto.currency,
      },
    });
    return {
      language: updated.language,
      currency: updated.currency,
    };
  }

  private async findVendorOrThrow(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }
}