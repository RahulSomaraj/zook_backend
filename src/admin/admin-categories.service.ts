import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { slugify } from '../common/utils/slug.util';
import { PrismaService } from '../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoryQueryDto } from './dto/list-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Category administration. Categories are the normalized source for the
 * vendor-facing category dropdown and are referenced by ProductCatalog.
 * Deletes are soft (archive + restore) so referenced rows are never orphaned;
 * `isActive` hides a category from dropdowns without archiving it.
 */
@Injectable()
export class AdminCategoriesService {
  private static readonly catalogCount = {
    _count: { select: { catalog: true } },
  } satisfies Prisma.CategoryInclude;

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCategoryQueryDto) {
    const where: Prisma.CategoryWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
        include: AdminCategoriesService.catalogCount,
      }),
    ]);

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  async getById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: AdminCategoriesService.catalogCount,
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? slugify(dto.name),
          icon: dto.icon ?? null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.getActiveOrThrow(id);
    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.slug,
          icon: dto.icon,
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
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id, deleted: true };
  }

  async restore(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (!category.deletedAt) {
      throw new ConflictException('Category is not archived');
    }
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { id, restored: true };
  }

  private async getActiveOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (category.deletedAt) {
      throw new ConflictException('Category is archived; restore it first');
    }
    return category;
  }

  private rethrowUniqueClash(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(
        'A category with this name or slug already exists',
      );
    }
    throw err;
  }
}
