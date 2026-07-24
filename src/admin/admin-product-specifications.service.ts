import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateProductSpecificationDto } from './dto/create-product-specification.dto';
import { UpdateProductSpecificationDto } from './dto/update-product-specification.dto';

/**
 * Normalized product-specification administration. Each row is a label/value
 * attribute belonging to a catalog entry (ProductCatalog), ordered by
 * `sortOrder`. `label` is unique per catalog. This complements the free-form
 * `specs` JSON on the catalog with queryable, individually-editable rows.
 */
@Injectable()
export class AdminProductSpecificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists every specification for a catalog entry, in display order. */
  async list(catalogId: string) {
    await this.assertCatalogExists(catalogId);
    return this.prisma.productSpecification.findMany({
      where: { catalogId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async getById(id: string) {
    const spec = await this.prisma.productSpecification.findUnique({
      where: { id },
    });
    if (!spec) throw new NotFoundException('Specification not found');
    return spec;
  }

  async create(catalogId: string, dto: CreateProductSpecificationDto) {
    await this.assertCatalogExists(catalogId);
    try {
      return await this.prisma.productSpecification.create({
        data: {
          catalogId,
          label: dto.label,
          value: dto.value,
          group: dto.group ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (err) {
      this.rethrowUniqueClash(err);
    }
  }

  async update(id: string, dto: UpdateProductSpecificationDto) {
    await this.getById(id); // 404 if missing
    try {
      return await this.prisma.productSpecification.update({
        where: { id },
        data: {
          label: dto.label,
          value: dto.value,
          group: dto.group,
          sortOrder: dto.sortOrder,
        },
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

  private async assertCatalogExists(catalogId: string) {
    const entry = await this.prisma.productCatalog.findUnique({
      where: { id: catalogId },
      select: { deletedAt: true },
    });
    if (!entry || entry.deletedAt) {
      throw new NotFoundException('Catalog product not found');
    }
  }

  private rethrowUniqueClash(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(
        'A specification with this label already exists for this catalog product',
      );
    }
    throw err;
  }
}
