import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Public, read-only view of countries for the storefront. The app uses this to
 * populate the country picker and to resolve the currency (code, symbol) and
 * exchange rate for whichever country the user selects. Only active,
 * non-archived countries are exposed.
 */
@Injectable()
export class CountriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active countries, default first, then admin sort order. */
  findAll() {
    return this.prisma.country.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: this.publicFields,
    });
  }

  /** Resolve one active country by its ISO 3166-1 alpha-2 code (e.g. "AE"). */
  async findByCode(iso2: string) {
    const country = await this.prisma.country.findFirst({
      where: { iso2: iso2.trim().toUpperCase(), isActive: true, deletedAt: null },
      select: this.publicFields,
    });
    if (!country) {
      throw new NotFoundException({
        message: 'Country not found',
        code: 'NOT_FOUND',
      });
    }
    return country;
  }

  private readonly publicFields = {
    id: true,
    name: true,
    iso2: true,
    dialCode: true,
    currencyCode: true,
    currencyName: true,
    currencySymbol: true,
    exchangeRate: true,
    isDefault: true,
  } as const;
}
