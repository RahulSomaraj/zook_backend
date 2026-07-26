import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async getWishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: { catalog: { include: { brand: true } } },
        },
      },
    });

    return items.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      product: {
        id: item.product.id,
        price: item.product.price,
        stockQty: item.product.stockQty,
        isActive: item.product.isActive,
        conditionGrade: item.product.conditionGrade,
        storageVariant: item.product.storageVariant,
        color: item.product.color,
        brand: item.product.catalog.brand.name,
        model: item.product.catalog.model,
        thumbnailUrl: item.product.catalog.stockImageUrl,
      },
    }));
  }

  async addItem(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });

    return this.getWishlist(userId);
  }

  async removeItem(userId: string, productId: string) {
    await this.prisma.wishlistItem.deleteMany({
      where: { userId, productId },
    });
    return this.getWishlist(userId);
  }
}