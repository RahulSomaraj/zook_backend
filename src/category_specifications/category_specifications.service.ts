import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { CreateCategorySpecificationDto } from './dto/create-category_specification.dto';
import { ListCategorySpecificationQueryDto } from './dto/list-category_specification.dto';
import { UpdateCategorySpecificationDto } from './dto/update-category_specification.dto';

/** A row as loaded by this service — `_count` only when the relation is included. */
type SpecificationRow = Prisma.CategorySpecificationGetPayload<object> & {
  _count?: { values: number };
};

/**
 * Category specification administration. A row here is the *definition* of an
 * attribute a category's products carry (e.g. Laptops -> "RAM"); the values
 * themselves live on ProductSpecification, one per catalog entry.
 *
 * Deletes are soft (archive + restore) so recorded values are never orphaned;
 * `isActive` hides a field from the product form without archiving it. Every
 * mutation stamps the acting admin onto the audit columns.
 */
@Injectable()
export class CategorySpecificationsService {
  // Number of catalog entries that have filled this specification in — the
  // admin UI uses it to warn before archiving a field that is in use.
  private static readonly valueCount = {
    _count: { select: { values: true } },
  } satisfies Prisma.CategorySpecificationInclude;

  // Cap on live fields per category, to keep the product form manageable.
  // Archived fields do not count towards it.
  private static readonly maxPerCategory = 6;

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCategorySpecificationQueryDto) {
    const where: Prisma.CategorySpecificationWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.label = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.categorySpecification.count({ where }),
      this.prisma.categorySpecification.findMany({
        where,
        // Same ordering the product form renders the fields in.
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        skip: query.skip,
        take: query.limit,
        include: CategorySpecificationsService.valueCount,
      }),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      meta: buildMeta(total, query.page, query.limit),
    };
  }

  async getById(id: string) {
    const spec = await this.prisma.categorySpecification.findUnique({
      where: { id },
      include: CategorySpecificationsService.valueCount,
    });
    if (!spec) throw new NotFoundException('Category specification not found');
    return this.toResponse(spec);
  }

  async create(userId: string, dto: CreateCategorySpecificationDto) {
    await this.assertCategoryUsable(dto.categoryId);
    // Checked up front so an archived duplicate produces an actionable message:
    // the unique index spans archived rows, so the create would otherwise fail
    // with a bare "already exists" for a row the admin cannot see.
    await this.assertLabelFree(dto.categoryId, dto.label);

    // Serves two purposes: enforcing the per-category cap, and defaulting a new
    // field to the end of the form instead of tying at 0.
    const count = await this.prisma.categorySpecification.count({
      where: { categoryId: dto.categoryId, deletedAt: null },
    });
    if (count >= CategorySpecificationsService.maxPerCategory) {
      throw new ConflictException(
        `This category already has the maximum of ${CategorySpecificationsService.maxPerCategory} specifications. Archive one before adding another.`,
      );
    }

    try {
      const spec = await this.prisma.categorySpecification.create({
        data: {
          categoryId: dto.categoryId,
          label: dto.label,
          sortOrder: dto.sortOrder ?? count,
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      return this.toResponse(spec);
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCategorySpecificationDto,
  ) {
    const spec = await this.getActiveOrThrow(id);
    if (dto.label && dto.label !== spec.label) {
      await this.assertLabelFree(spec.categoryId, dto.label);
    }

    try {
      const updated = await this.prisma.categorySpecification.update({
        where: { id },
        data: {
          label: dto.label,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
          updatedBy: userId,
        },
      });
      return this.toResponse(updated);
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async softDelete(userId: string, id: string) {
    await this.getActiveOrThrow(id);
    await this.prisma.categorySpecification.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { id, deleted: true };
  }

  async restore(userId: string, id: string) {
    const spec = await this.prisma.categorySpecification.findUnique({
      where: { id },
    });
    if (!spec) throw new NotFoundException('Category specification not found');
    if (!spec.deletedAt) {
      throw new ConflictException('Category specification is not archived');
    }
    await this.prisma.categorySpecification.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null, updatedBy: userId },
    });
    return { id, restored: true };
  }

  /** The category must exist and not be archived to hang new fields off it. */
  private async assertCategoryUsable(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { deletedAt: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.deletedAt) {
      throw new ConflictException('Category is archived; restore it first');
    }
  }

  private async assertLabelFree(categoryId: string, label: string) {
    const existing = await this.prisma.categorySpecification.findUnique({
      where: { categoryId_label: { categoryId, label } },
      select: { deletedAt: true },
    });
    if (!existing) return;
    throw new ConflictException(
      existing.deletedAt
        ? 'A specification with this label is archived for this category; restore it instead'
        : 'A specification with this label already exists for this category',
    );
  }

  private async getActiveOrThrow(id: string) {
    const spec = await this.prisma.categorySpecification.findUnique({
      where: { id },
    });
    if (!spec) throw new NotFoundException('Category specification not found');
    if (spec.deletedAt) {
      throw new ConflictException(
        'Category specification is archived; restore it first',
      );
    }
    return spec;
  }

  /**
   * Shapes a row into the documented response. Fields are picked explicitly so
   * columns added to the model later are not exposed by accident, and so the
   * Prisma-flavoured `_count.values` is not part of the public contract.
   * `valueCount` is omitted on create/update, where the relation is not loaded.
   */
  private toResponse(spec: SpecificationRow) {
    return {
      id: spec.id,
      categoryId: spec.categoryId,
      label: spec.label,
      sortOrder: spec.sortOrder,
      isActive: spec.isActive,
      createdAt: spec.createdAt,
      updatedAt: spec.updatedAt,
      deletedAt: spec.deletedAt,
      createdBy: spec.createdBy,
      updatedBy: spec.updatedBy,
      deletedBy: spec.deletedBy,
      ...(spec._count ? { valueCount: spec._count.values } : {}),
    };
  }

  private rethrowUniqueClash(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(
        'A specification with this label already exists for this category',
      );
    }
    throw err;
  }
}
