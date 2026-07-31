import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { CreateProductSpecificationDto } from './dto/create-product-specification.dto';
import { ListProductSpecificationQueryDto } from './dto/list-product-specification.dto';
import { UpdateProductSpecificationDto } from './dto/update-product-specification.dto';

/**
 * Normalized product-specification administration. Each row is the value a
 * catalog entry (ProductCatalog) carries for one attribute, ordered by
 * `sortOrder`. This complements the free-form `specs` JSON on the catalog with
 * queryable, individually-editable rows.
 *
 * A row normally answers a CategorySpecification — a field the admin defined
 * for the catalog entry's category — in which case `label` is copied from that
 * definition rather than typed. Rows with a null `specId` are one-off
 * attributes the category does not define. Both `label` and `specId` are unique
 * per catalog entry.
 */
@Injectable()
export class AdminProductSpecificationsService {
  // The definition each value answers, so the admin UI can show which category
  // field a row belongs to without a second round trip.
  private static readonly withDefinition = {
    spec: {
      select: { id: true, label: true, sortOrder: true, isActive: true },
    },
  } satisfies Prisma.ProductSpecificationInclude;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Flat listing across the whole catalog — every spec row with the model it
   * belongs to, rather than one catalog entry's sheet. Answers "which products
   * mention 128 GB?" without knowing any id up front.
   */
  async listAll(query: ListProductSpecificationQueryDto) {
    return query.grouped ? this.listGrouped(query) : this.listRows(query);
  }

  /**
   * One row per catalog product, each spec label becoming a key:
   *   { product: "Apple iPhone 13", "Display": "6.1-inch…", "Chipset": "A15…" }
   *
   * Paginates over products rather than spec rows, so a page of 20 is 20
   * products. Labels are emitted in each product's own sortOrder.
   */
  private async listGrouped(query: ListProductSpecificationQueryDto) {
    const where: Prisma.ProductCatalogWhereInput = { deletedAt: null };
    if (query.catalogId) where.id = query.catalogId;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      const contains = query.search.trim();
      where.OR = [
        { model: { contains, mode: 'insensitive' } },
        { specifications: { some: { label: { contains, mode: 'insensitive' } } } },
        { specifications: { some: { value: { contains, mode: 'insensitive' } } } },
      ];
    }

    const specFilter: Prisma.ProductSpecificationWhereInput | undefined =
      query.linkedOnly === undefined
        ? undefined
        : { specId: query.linkedOnly ? { not: null } : null };

    const [total, catalogs] = await this.prisma.$transaction([
      this.prisma.productCatalog.count({ where }),
      this.prisma.productCatalog.findMany({
        where,
        orderBy: { model: 'asc' },
        skip: query.skip,
        take: query.limit,
        select: {
          id: true,
          model: true,
          year: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
          specifications: {
            where: specFilter,
            orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
            select: { label: true, value: true },
          },
        },
      }),
    ]);

    const items = catalogs.map((catalog) => {
      const row: Record<string, unknown> = {
        catalogId: catalog.id,
        product: [catalog.brand.name, catalog.model].join(' '),
        year: catalog.year,
        category: catalog.category.name,
      };
      // Fixed keys are claimed first; a spec label that would collide with one
      // (a field literally called "Category") is prefixed instead of silently
      // overwriting the product's own metadata.
      for (const spec of catalog.specifications) {
        const collides = Object.prototype.hasOwnProperty.call(row, spec.label);
        row[collides ? `spec_${spec.label}` : spec.label] = spec.value;
      }
      return row;
    });

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  private async listRows(query: ListProductSpecificationQueryDto) {
    const where: Prisma.ProductSpecificationWhereInput = {
      // Archived catalog entries are hidden everywhere else; stay consistent.
      catalog: { deletedAt: null },
    };
    if (query.catalogId) where.catalogId = query.catalogId;
    if (query.linkedOnly !== undefined) {
      where.specId = query.linkedOnly ? { not: null } : null;
    }
    if (query.categoryId) {
      where.catalog = { deletedAt: null, categoryId: query.categoryId };
    }
    if (query.search) {
      const contains = query.search.trim();
      where.OR = [
        { label: { contains, mode: 'insensitive' } },
        { value: { contains, mode: 'insensitive' } },
        { catalog: { model: { contains, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productSpecification.count({ where }),
      this.prisma.productSpecification.findMany({
        where,
        // Grouped by product, then in each product's own display order.
        orderBy: [
          { catalog: { model: 'asc' } },
          { sortOrder: 'asc' },
          { label: 'asc' },
        ],
        skip: query.skip,
        take: query.limit,
        include: {
          catalog: {
            select: {
              id: true,
              model: true,
              year: true,
              brand: { select: { name: true } },
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      catalogId: row.catalogId,
      // "Apple iPhone 13 (2021)" — what a human recognises the row by.
      product: [row.catalog.brand.name, row.catalog.model].join(' '),
      year: row.catalog.year,
      category: row.catalog.category.name,
      label: row.label,
      value: row.value,
      specId: row.specId,
    }));

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  /** Lists every specification for a catalog entry, in display order. */
  async list(catalogId: string) {
    await this.getCatalogOrThrow(catalogId);
    return this.prisma.productSpecification.findMany({
      where: { catalogId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: AdminProductSpecificationsService.withDefinition,
    });
  }

  async getById(id: string) {
    const spec = await this.prisma.productSpecification.findUnique({
      where: { id },
      include: AdminProductSpecificationsService.withDefinition,
    });
    if (!spec) throw new NotFoundException('Specification not found');
    return spec;
  }

  async create(catalogId: string, dto: CreateProductSpecificationDto) {
    const catalog = await this.getCatalogOrThrow(catalogId);

    if (!dto.specId === !dto.label) {
      throw new BadRequestException(
        'Supply either specId (a field defined for this category) or label, but not both',
      );
    }

    // With specId the label and default order come from the definition, so the
    // two can never disagree about what the row is answering.
    const definition = dto.specId
      ? await this.getDefinitionOrThrow(dto.specId, catalog.categoryId)
      : null;

    try {
      return await this.prisma.productSpecification.create({
        data: {
          catalogId,
          specId: definition?.id ?? null,
          label: definition?.label ?? dto.label!,
          value: dto.value,
          group: dto.group ?? null,
          sortOrder: dto.sortOrder ?? definition?.sortOrder ?? 0,
        },
        include: AdminProductSpecificationsService.withDefinition,
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async update(id: string, dto: UpdateProductSpecificationDto) {
    const existing = await this.getById(id); // 404 if missing

    // The label of a row backed by a definition is that definition's to change;
    // editing it here would desync the snapshot from what it answers.
    if (dto.label !== undefined && existing.specId) {
      throw new ConflictException(
        'This specification is defined by its category; rename the category specification instead',
      );
    }

    try {
      return await this.prisma.productSpecification.update({
        where: { id },
        data: {
          label: dto.label,
          value: dto.value,
          group: dto.group,
          sortOrder: dto.sortOrder,
        },
        include: AdminProductSpecificationsService.withDefinition,
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async remove(id: string) {
    await this.getById(id); // 404 if missing
    await this.prisma.productSpecification.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async getCatalogOrThrow(catalogId: string) {
    const entry = await this.prisma.productCatalog.findUnique({
      where: { id: catalogId },
      select: { categoryId: true, deletedAt: true },
    });
    if (!entry || entry.deletedAt) {
      throw new NotFoundException('Catalog product not found');
    }
    return entry;
  }

  /**
   * The definition must belong to the catalog entry's own category — otherwise
   * a "Battery" field defined for Laptops could be answered by a smartphone.
   */
  private async getDefinitionOrThrow(specId: string, categoryId: string) {
    const definition = await this.prisma.categorySpecification.findUnique({
      where: { id: specId },
      select: {
        id: true,
        label: true,
        sortOrder: true,
        isActive: true,
        categoryId: true,
        deletedAt: true,
      },
    });
    if (!definition || definition.deletedAt) {
      throw new NotFoundException('Category specification not found');
    }
    if (definition.categoryId !== categoryId) {
      throw new BadRequestException(
        "This specification belongs to a different category than the catalog product's",
      );
    }
    if (!definition.isActive) {
      throw new ConflictException(
        'This category specification is inactive; reactivate it before recording values',
      );
    }
    return definition;
  }

  private rethrowUniqueClash(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(
        'This catalog product already has a value for this specification',
      );
    }
    throw err;
  }
}
