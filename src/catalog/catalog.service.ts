import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, ConditionGrade } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SearchCatalogDto } from './dto/search-catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async search(dto: SearchCatalogDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const where: any = { status: CatalogStatus.active, deletedAt: null };
    if (dto.categoryId) where.categoryId = dto.categoryId;
    if (dto.q) {
      where.OR = [
        { model: { contains: dto.q, mode: 'insensitive' } },
        { brand: { name: { contains: dto.q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.productCatalog.findMany({
        where,
        include: { brand: true, category: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.productCatalog.count({ where }),
    ]);

    const catalogIds = items.map((item) => item.id);
    const priceRanges = await this.getPriceRangesForCatalogIds(catalogIds);

    const itemsWithPriceRange = items.map((item) => ({
      ...item,
      priceRange: priceRanges.get(item.id) ?? {
        min: null,
        max: null,
        sampleSize: 0,
        currency: 'AED',
      },
    }));

    return { items: itemsWithPriceRange, total, page, limit };
  }

  async findOne(id: string) {
    const item = await this.prisma.productCatalog.findFirst({
      where: { id, deletedAt: null },
      include: { brand: true, category: true },
    });
    if (!item) throw new NotFoundException('Catalog item not found');
    return item;
  }

  async getPriceSuggestion(catalogId: string, conditionGrade?: ConditionGrade) {
    await this.findOne(catalogId); // throws 404 if catalog item doesn't exist

    const where: any = { catalogId, isActive: true };
    if (conditionGrade) where.conditionGrade = conditionGrade;

    const agg = await this.prisma.product.aggregate({
      where,
      _min: { price: true },
      _max: { price: true },
      _count: true,
    });

    return {
      catalogId,
      conditionGrade: conditionGrade ?? null,
      min: agg._min.price,
      max: agg._max.price,
      sampleSize: agg._count,
      currency: 'AED',
    };
  }

  private async getPriceRangesForCatalogIds(catalogIds: string[]) {
    const map = new Map<string,
      { min: any; max: any; sampleSize: number; currency: string }
    >();
    if (catalogIds.length === 0) return map;

    const grouped = await this.prisma.product.groupBy({
      by: ['catalogId'],
      where: { catalogId: { in: catalogIds }, isActive: true },
      _min: { price: true },
      _max: { price: true },
      _count: true,
    });

    for (const row of grouped) {
      map.set(row.catalogId, {
        min: row._min.price,
        max: row._max.price,
        sampleSize: row._count,
        currency: 'AED',
      });
    }
    return map;
  }
}