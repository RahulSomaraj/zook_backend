import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { slugify } from '../common/utils/slug.util';
import { PrismaService } from '../database/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { ListBrandQueryDto } from './dto/list-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

/**
 * Brand administration. Brands are the normalized source for the vendor-facing
 * brand dropdown and are referenced by ProductCatalog. Deletes are soft
 * (archive + restore): a referenced brand always still exists, so catalog
 * entries are never orphaned. `isActive` hides a brand from dropdowns without
 * archiving it.
 */
@Injectable()
export class AdminBrandsService {
  private static readonly catalogCount = {
    _count: { select: { catalog: true } },
  } satisfies Prisma.BrandInclude;

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListBrandQueryDto) {
    const where: Prisma.BrandWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
        include: AdminBrandsService.catalogCount,
      }),
    ]);

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  async getById(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: AdminBrandsService.catalogCount,
    });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async create(dto: CreateBrandDto) {
    try {
      return await this.prisma.brand.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? slugify(dto.name),
          logoUrl: dto.logoUrl ?? null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.getActiveOrThrow(id);
    try {
      return await this.prisma.brand.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          logoUrl: dto.logoUrl,
          isActive: dto.isActive,
          sortOrder: dto.sortOrder,
        },
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async softDelete(id: string) {
    await this.getActiveOrThrow(id);
    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id, deleted: true };
  }

  async restore(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    if (!brand.deletedAt) throw new ConflictException('Brand is not archived');
    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { id, restored: true };
  }

  private async getActiveOrThrow(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    if (brand.deletedAt) {
      throw new ConflictException('Brand is archived; restore it first');
    }
    return brand;
  }

  private rethrowUniqueClash(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('A brand with this name or slug already exists');
    }
    throw err;
  }
}
