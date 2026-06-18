import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { QueryCatalogDto } from './dto/query-catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCatalogDto) {
    const where: Prisma.ProductCatalogWhereInput = {
      ...(query.category && {
        category: { equals: query.category, mode: 'insensitive' },
      }),
      ...(query.brand && {
        brand: { equals: query.brand, mode: 'insensitive' },
      }),
      ...(query.search && {
        OR: [
          { brand: { contains: query.search, mode: 'insensitive' } },
          { model: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productCatalog.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ brand: 'asc' }, { model: 'asc' }],
      }),
      this.prisma.productCatalog.count({ where }),
    ]);

    return { data, meta: buildMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const entry = await this.prisma.productCatalog.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException('Catalog entry not found');
    return entry;
  }
}
