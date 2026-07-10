import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const vendorSettingsSelect = {
  id: true,
  userId: true,
  language: true,
  currency: true,
} satisfies Prisma.VendorSelect;

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
    const data: Prisma.VendorUpdateInput = {
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
    };

    const updated = await this.prisma.vendor.update({
      where: { id: vendor.id },
      data,
      select: vendorSettingsSelect,
    });
    return {
      language: updated.language,
      currency: updated.currency,
    };
  }

  private async findVendorOrThrow(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: vendorSettingsSelect,
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }
}
