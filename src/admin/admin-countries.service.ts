import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { ListCountryQueryDto } from './dto/list-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

/**
 * Country administration. A country carries the currency (code, symbol, name)
 * and the exchange rate the app uses to convert AED base prices for users in
 * that country. Deletes are soft (archive + restore) so historical references
 * are never orphaned. `isActive` hides a country from the public list without
 * archiving it. At most one country should be `isDefault`; setting a new
 * default clears the previous one in the same transaction.
 */
@Injectable()
export class AdminCountriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCountryQueryDto) {
    const where: Prisma.CountryWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { currencyCode: { contains: term, mode: 'insensitive' } },
        { iso2: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.country.count({ where }),
      this.prisma.country.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
    ]);

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  async getById(id: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) throw new NotFoundException('Country not found');
    return country;
  }

  async create(dto: CreateCountryDto) {
    const data: Prisma.CountryCreateInput = {
      name: dto.name,
      iso2: dto.iso2,
      dialCode: dto.dialCode,
      currencyCode: dto.currencyCode,
      currencyName: dto.currencyName,
      currencySymbol: dto.currencySymbol,
      exchangeRate: dto.exchangeRate,
      isDefault: dto.isDefault,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) await this.clearDefault(tx);
        return tx.country.create({ data });
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async update(id: string, dto: UpdateCountryDto) {
    await this.getActiveOrThrow(id);
    const data: Prisma.CountryUpdateInput = {
      name: dto.name,
      iso2: dto.iso2,
      dialCode: dto.dialCode,
      currencyCode: dto.currencyCode,
      currencyName: dto.currencyName,
      currencySymbol: dto.currencySymbol,
      exchangeRate: dto.exchangeRate,
      isDefault: dto.isDefault,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) await this.clearDefault(tx, id);
        return tx.country.update({ where: { id }, data });
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async softDelete(id: string) {
    await this.getActiveOrThrow(id);
    await this.prisma.country.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
    return { id, deleted: true };
  }

  async restore(id: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) throw new NotFoundException('Country not found');
    if (!country.deletedAt) throw new ConflictException('Country is not archived');
    await this.prisma.country.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { id, restored: true };
  }

  /** Unsets the current default so at most one country stays default. */
  private clearDefault(tx: Prisma.TransactionClient, exceptId?: string) {
    return tx.country.updateMany({
      where: { isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  private async getActiveOrThrow(id: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) throw new NotFoundException('Country not found');
    if (country.deletedAt) {
      throw new ConflictException('Country is archived; restore it first');
    }
    return country;
  }

  private rethrowUniqueClash(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('A country with this name or ISO code already exists');
    }
    throw err;
  }
}
