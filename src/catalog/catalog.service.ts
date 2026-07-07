import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus } from '@prisma/client';
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

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const item = await this.prisma.productCatalog.findFirst({
      where: { id, deletedAt: null },
      include: { brand: true, category: true },
    });
    if (!item) throw new NotFoundException('Catalog item not found');
    return item;
  }
}