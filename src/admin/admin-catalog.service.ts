import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogStatus, Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { ListCatalogQueryDto } from './dto/list-catalog.dto';
import { UpdateCatalogProductDto } from './dto/update-catalog-product.dto';

/**
 * Master product catalog administration. Vendors search these entries when
 * creating listings, so (brandId, model, year) is unique and entries carry an
 * active/draft status. Brand and category are foreign keys; deletes are soft
 * (archive + restore), mirroring vendors, so live listings referencing an entry
 * are never orphaned.
 */
@Injectable()
export class AdminCatalogService {
  private static readonly listInclude = {
    brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
    category: { select: { id: true, name: true, slug: true, icon: true } },
    _count: { select: { products: { where: { isActive: true } } } },
  } satisfies Prisma.ProductCatalogInclude;

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCatalogQueryDto) {
    const where: Prisma.ProductCatalogWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { brand: { name: { contains: q, mode: 'insensitive' } } },
        { model: { contains: q, mode: 'insensitive' } },
        { category: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.productCatalog.count({ where }),
      this.prisma.productCatalog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: AdminCatalogService.listInclude,
      }),
    ]);

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  async getById(id: string) {
    const entry = await this.prisma.productCatalog.findUnique({
      where: { id },
      include: AdminCatalogService.listInclude,
    });
    if (!entry) throw new NotFoundException('Catalog product not found');
    return entry;
  }

  async create(dto: CreateCatalogProductDto) {
    await this.assertBrandExists(dto.brandId);
    await this.assertCategoryExists(dto.categoryId);

    try {
      return await this.prisma.productCatalog.create({
        data: {
          brandId: dto.brandId,
          model: dto.model,
          year: dto.year ?? null,
          categoryId: dto.categoryId,
          stockImageUrl: dto.stockImageUrl ?? null,
          specs: this.toSpecsJson(dto.specs),
          description: dto.description ?? null,
          status: dto.status ?? CatalogStatus.active,
        },
        include: AdminCatalogService.listInclude,
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async update(id: string, dto: UpdateCatalogProductDto) {
    await this.getActiveOrThrow(id);
    if (dto.brandId !== undefined) await this.assertBrandExists(dto.brandId);
    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const data: Prisma.ProductCatalogUpdateInput = {
      model: dto.model,
      stockImageUrl: dto.stockImageUrl,
      description: dto.description,
      status: dto.status,
    };
    if (dto.brandId !== undefined) {
      data.brand = { connect: { id: dto.brandId } };
    }
    if (dto.categoryId !== undefined) {
      data.category = { connect: { id: dto.categoryId } };
    }
    if (dto.year !== undefined) data.year = dto.year;
    if (dto.specs !== undefined) data.specs = this.toSpecsJson(dto.specs);

    try {
      return await this.prisma.productCatalog.update({
        where: { id },
        data,
        include: AdminCatalogService.listInclude,
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async softDelete(id: string) {
    await this.getActiveOrThrow(id);
    await this.prisma.productCatalog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id, deleted: true };
  }

  async restore(id: string) {
    const entry = await this.prisma.productCatalog.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Catalog product not found');
    if (!entry.deletedAt) {
      throw new ConflictException('Catalog product is not archived');
    }
    await this.prisma.productCatalog.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { id, restored: true };
  }

  private async getActiveOrThrow(id: string) {
    const entry = await this.prisma.productCatalog.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Catalog product not found');
    if (entry.deletedAt) {
      throw new ConflictException(
        'Catalog product is archived; restore it first',
      );
    }
    return entry;
  }

  private async assertBrandExists(brandId: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { deletedAt: true },
    });
    if (!brand || brand.deletedAt) {
      throw new BadRequestException('Brand not found');
    }
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { deletedAt: true },
    });
    if (!category || category.deletedAt) {
      throw new BadRequestException('Category not found');
    }
  }

  private toSpecsJson(
    specs?: CreateCatalogProductDto['specs'],
  ): Prisma.InputJsonValue | undefined {
    if (specs === undefined) return undefined;
    return { ...specs } as Prisma.InputJsonValue;
  }

  private rethrowUniqueClash(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(
        'A catalog product with this brand, model and year already exists',
      );
    }
    throw err;
  }
}
