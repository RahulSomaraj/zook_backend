import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VendorStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { buildMeta } from '../common/dto/pagination.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';

const productListInclude = {
  vendor: {
    select: {
      id: true,
      storeName: true,
      storeLogoUrl: true,
    },
  },
  catalog: {
    include: {
      brand: true,
      category: true,
    },
  },
} satisfies Prisma.ProductInclude;

type ProductListRow = Prisma.ProductGetPayload<{
  include: typeof productListInclude;
}>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unified buyer product list: sort + filters + pagination. Returns
   * `{ items, meta }` where `meta` carries paging info.
   */
  async list(query: QueryProductsDto) {
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query.sort);

    // Single round trip: page of rows + total count for the same filter.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productListInclude,
        orderBy,
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map((item) => this.toSummary(item)),
      meta: buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * @deprecated Use `GET /products?sort=recent&limit=20`. Kept as a thin alias
   * so existing clients keep working; delete once callers migrate.
   */
  async getRecentlyListed(countryCode?: string) {
    return this.legacyList(ProductSort.RECENT, countryCode);
  }

  /**
   * @deprecated Use `GET /products?sort=top_picks&limit=20`. Kept as a thin
   * alias so existing clients keep working; delete once callers migrate.
   */
  async getTopPicks(countryCode?: string) {
    return this.legacyList(ProductSort.TOP_PICKS, countryCode);
  }

  /** Backward-compatible shape (`{ items }`, no meta) for the old endpoints. */
  private async legacyList(sort: ProductSort, countryCode?: string) {
    const items = await this.prisma.product.findMany({
      where: this.buyerVisibleWhere(countryCode),
      include: productListInclude,
      orderBy: this.buildOrderBy(sort),
      take: 20,
    });
    return { items: items.map((item) => this.toSummary(item)) };
  }

  async findOne(id: string) {
    const item = await this.prisma.product.findFirst({
      where: {
        id,
        ...this.buyerVisibleWhere(),
      },
      include: {
        vendor: {
          select: {
            id: true,
            storeName: true,
            storeLogoUrl: true,
            storeAddress: true,
          },
        },
        catalog: {
          include: {
            brand: true,
            category: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Product not found');
    }

    return {
      id: item.id,
      source: item.source,
      price: item.price,
      stockQty: item.stockQty,
      conditionGrade: item.conditionGrade,
      storageVariant: item.storageVariant,
      color: item.color,
      description: item.description,
      whatIsIncluded: item.whatIsIncluded,
      inspectionImages: item.inspectionImages,
      createdAt: item.createdAt,
      catalog: {
        id: item.catalog.id,
        brand: item.catalog.brand.name,
        model: item.catalog.model,
        year: item.catalog.year,
        category: {
          id: item.catalog.category.id,
          name: item.catalog.category.name,
          slug: item.catalog.category.slug,
          icon: item.catalog.category.icon,
        },
        stockImageUrl: item.catalog.stockImageUrl,
        specs: item.catalog.specs,
        description: item.catalog.description,
      },
      vendor: item.vendor
        ? {
            id: item.vendor.id,
            storeName: item.vendor.storeName,
            storeLogoUrl: item.vendor.storeLogoUrl,
            storeAddress: item.vendor.storeAddress,
          }
        : null,
    };
  }

  /**
   * Buyer-visible products: active, in stock, and either a C2C listing or one
   * from an approved (non-archived) vendor. When `countryCode` (ISO 3166-1
   * alpha-2, e.g. "AE") is given, the store is scoped to that country: only
   * products from vendors based there are returned. C2C listings have no
   * vendor — and therefore no country — so they are excluded from a
   * country-scoped view.
   */
  private buyerVisibleWhere(countryCode?: string): Prisma.ProductWhereInput {
    const approvedVendor: Prisma.VendorWhereInput = {
      status: VendorStatus.approved,
      deletedAt: null,
    };

    const code = countryCode?.trim().toUpperCase();
    if (code) {
      return {
        isActive: true,
        stockQty: { gt: 0 },
        vendor: { ...approvedVendor, country: { iso2: code } },
      };
    }

    return {
      isActive: true,
      stockQty: { gt: 0 },
      OR: [{ vendorId: null }, { vendor: approvedVendor }],
    };
  }

  /**
   * Buyer-visible base scope + the optional filters from the query. Catalog
   * filters (category/brand/year/search) are collected into one nested
   * `catalog` condition.
   */
  private buildWhere(q: QueryProductsDto): Prisma.ProductWhereInput {
    const where = this.buyerVisibleWhere(q.country);

    if (q.source) where.source = q.source;
    if (q.condition) where.conditionGrade = q.condition;
    if (q.vendor_id) where.vendorId = q.vendor_id;
    if (q.storage) {
      where.storageVariant = { equals: q.storage, mode: 'insensitive' };
    }
    if (q.color) {
      where.color = { equals: q.color, mode: 'insensitive' };
    }

    if (q.min_price != null || q.max_price != null) {
      const price: { gte?: number; lte?: number } = {};
      if (q.min_price != null) price.gte = q.min_price;
      if (q.max_price != null) price.lte = q.max_price;
      where.price = price;
    }

    const catalog: Prisma.ProductCatalogWhereInput = {};
    if (q.category_id) catalog.categoryId = q.category_id;
    if (q.brand_id) catalog.brandId = q.brand_id;
    if (q.year != null) catalog.year = q.year;
    if (q.search) {
      catalog.OR = [
        { model: { contains: q.search, mode: 'insensitive' } },
        { brand: { name: { contains: q.search, mode: 'insensitive' } } },
      ];
    }
    if (Object.keys(catalog).length > 0) {
      where.catalog = catalog;
    }

    return where;
  }

  /** Map the sort enum to a Prisma orderBy. */
  private buildOrderBy(
    sort: ProductSort,
  ): Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case ProductSort.OLDEST:
        return { createdAt: 'asc' };
      case ProductSort.PRICE_LOW:
        return [{ price: 'asc' }, { createdAt: 'desc' }];
      case ProductSort.PRICE_HIGH:
      case ProductSort.TOP_PICKS:
        // Premium-first heuristic until popularity/curation signals exist.
        return [{ price: 'desc' }, { createdAt: 'desc' }];
      case ProductSort.RECENT:
      default:
        return { createdAt: 'desc' };
    }
  }

  private toSummary(item: ProductListRow) {
    return {
      id: item.id,
      source: item.source,
      price: item.price,
      stockQty: item.stockQty,
      conditionGrade: item.conditionGrade,
      storageVariant: item.storageVariant,
      color: item.color,
      createdAt: item.createdAt,
      thumbnailUrl: item.inspectionImages[0] ?? item.catalog.stockImageUrl,
      brand: item.catalog.brand.name,
      model: item.catalog.model,
      category: {
        id: item.catalog.category.id,
        name: item.catalog.category.name,
        slug: item.catalog.category.slug,
      },
      vendor: item.vendor
        ? {
            id: item.vendor.id,
            storeName: item.vendor.storeName,
            storeLogoUrl: item.vendor.storeLogoUrl,
          }
        : null,
    };
  }
}
