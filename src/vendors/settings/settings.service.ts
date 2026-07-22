import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const vendorSettingsSelect = {
  id: true,
  userId: true,
  language: true,
  currency: true,
  countryId: true,
  country: {
    select: {
      id: true,
      name: true,
      iso2: true,
      currencyCode: true,
      currencyName: true,
      currencySymbol: true,
    },
  },
} satisfies Prisma.VendorSelect;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    const vendor = await this.findVendorOrThrow(userId);
    return this.toResponse(vendor);
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const vendor = await this.findVendorOrThrow(userId);
    const data: Prisma.VendorUpdateInput = {
      ...(dto.language !== undefined ? { language: dto.language } : {}),
    };

    // A country change drives currency: link the country and mirror its
    // currencyCode onto `currency` so existing readers stay in sync.
    if (dto.countryId !== undefined) {
      const country = await this.prisma.country.findFirst({
        where: { id: dto.countryId, isActive: true, deletedAt: null },
        select: { id: true, currencyCode: true },
      });
      if (!country) {
        throw new BadRequestException('Country not found or inactive');
      }
      data.country = { connect: { id: country.id } };
      data.currency = country.currencyCode;
    }

    const updated = await this.prisma.vendor.update({
      where: { id: vendor.id },
      data,
      select: vendorSettingsSelect,
    });
    return this.toResponse(updated);
  }

  private toResponse(
    vendor: Prisma.VendorGetPayload<{ select: typeof vendorSettingsSelect }>,
  ) {
    return {
      language: vendor.language,
      currency: vendor.currency,
      country: vendor.country,
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
