import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VendorStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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

  async getRecentlyListed() {
    const items = await this.prisma.product.findMany({
      where: this.buyerVisibleWhere(),
      include: productListInclude,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { items: items.map((item) => this.toSummary(item)) };
  }

  async getTopPicks() {
    const items = await this.prisma.product.findMany({
      where: this.buyerVisibleWhere(),
      include: productListInclude,
      // Until we have popularity/curation signals, top picks use a simple
      // premium-first heuristic.
      orderBy: [{ price: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });

    return { items: items.map((item) => this.toSummary(item)) };
  }

  async list(categoryId?: string) {
    const where = this.buyerVisibleWhere();
    if (categoryId) {
      where.catalog = { categoryId };
    }

    const items = await this.prisma.product.findMany({
      where,
      include: productListInclude,
      orderBy: { createdAt: 'desc' },
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

  private buyerVisibleWhere(): Prisma.ProductWhereInput {
    return {
      isActive: true,
      stockQty: { gt: 0 },
      OR: [
        { vendorId: null },
        {
          vendor: {
            status: VendorStatus.approved,
            deletedAt: null,
          },
        },
      ],
    };
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
