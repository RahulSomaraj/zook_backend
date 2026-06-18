import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductSource } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { VendorsService } from '../vendors/vendors.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// Text expression used for both filtering and ranking.
const FTS_DOC = Prisma.sql`to_tsvector('simple',
  coalesce(c.brand,'') || ' ' || coalesce(c.model,'') || ' ' ||
  coalesce(p.description,'') || ' ' || coalesce(p.color,''))`;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vendors: VendorsService,
  ) {}

  /**
   * Public catalogue listing with filters + Postgres full-text search.
   * Search matches across catalog brand/model and the listing's
   * description/colour, ranked by relevance.
   */
  async findAll(query: QueryProductsDto) {
    const conditions: Prisma.Sql[] = [Prisma.sql`p.is_active = true`];

    if (query.brand)
      conditions.push(Prisma.sql`c.brand ILIKE ${query.brand}`);
    if (query.category)
      conditions.push(Prisma.sql`c.category ILIKE ${query.category}`);
    if (query.source)
      conditions.push(Prisma.sql`p.source = ${query.source}::"ProductSource"`);
    if (query.conditionGrade)
      conditions.push(
        Prisma.sql`p.condition_grade = ${query.conditionGrade}::"ConditionGrade"`,
      );
    if (query.minPrice !== undefined)
      conditions.push(Prisma.sql`p.price >= ${query.minPrice}`);
    if (query.maxPrice !== undefined)
      conditions.push(Prisma.sql`p.price <= ${query.maxPrice}`);
    if (query.search)
      conditions.push(
        Prisma.sql`${FTS_DOC} @@ plainto_tsquery('simple', ${query.search})`,
      );

    const whereSql = Prisma.join(conditions, ' AND ');
    const orderSql = query.search
      ? Prisma.sql`ORDER BY ts_rank(${FTS_DOC}, plainto_tsquery('simple', ${query.search})) DESC, p.created_at DESC`
      : Prisma.sql`ORDER BY p.created_at DESC`;

    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p.id
      FROM products p
      JOIN product_catalog c ON c.id = p.catalog_id
      WHERE ${whereSql}
      ${orderSql}
      LIMIT ${query.limit} OFFSET ${query.skip}
    `);

    const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM products p
      JOIN product_catalog c ON c.id = p.catalog_id
      WHERE ${whereSql}
    `);
    const total = Number(countRows[0]?.count ?? 0n);

    const ids = idRows.map((r) => r.id);
    if (ids.length === 0) {
      return { data: [], meta: buildMeta(total, query.page, query.limit) };
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { catalog: true },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    products.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

    return { data: products, meta: buildMeta(total, query.page, query.limit) };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { catalog: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Create a vendor listing. Caller must be an approved vendor. */
  async create(userId: string, dto: CreateProductDto) {
    const vendor = await this.vendors.requireApprovedVendor(userId);

    const catalog = await this.prisma.productCatalog.findUnique({
      where: { id: dto.catalogId },
    });
    if (!catalog) throw new NotFoundException('Catalog entry not found');

    return this.prisma.product.create({
      data: {
        vendorId: vendor.id,
        catalogId: dto.catalogId,
        source: ProductSource.vendor,
        conditionGrade: dto.conditionGrade,
        storageVariant: dto.storageVariant,
        color: dto.color,
        inspectionImages: dto.inspectionImages ?? [],
        description: dto.description,
        whatIsIncluded: dto.whatIsIncluded as Prisma.InputJsonValue,
        price: dto.price,
        stockQty: dto.stockQty ?? 1,
      },
      include: { catalog: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateProductDto) {
    await this.assertOwnership(userId, id);
    return this.prisma.product.update({
      where: { id },
      data: {
        catalogId: dto.catalogId,
        conditionGrade: dto.conditionGrade,
        storageVariant: dto.storageVariant,
        color: dto.color,
        inspectionImages: dto.inspectionImages,
        description: dto.description,
        whatIsIncluded: dto.whatIsIncluded as Prisma.InputJsonValue | undefined,
        price: dto.price,
        stockQty: dto.stockQty,
        isActive: dto.isActive,
      },
      include: { catalog: true },
    });
  }

  /** Soft delete — listings are deactivated, never hard-deleted. */
  async remove(userId: string, id: string) {
    await this.assertOwnership(userId, id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return { id, deactivated: true };
  }

  private async assertOwnership(userId: string, productId: string) {
    const vendor = await this.vendors.requireApprovedVendor(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { vendorId: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this product');
    }
  }
}
