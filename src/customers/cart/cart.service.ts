import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    return this.toCartResponse(cart);
  }

  async addItem(userId: string, productId: string, quantity: number) {
    const product = await this.requirePurchasableProduct(productId);
    const cart = await this.getOrCreateCart(userId);

    const existing = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
    });

    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    this.ensureStock(product.stockQty, nextQuantity);

    await this.prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId,
        },
      },
      create: {
        cartId: cart.id,
        productId,
        quantity,
      },
      update: {
        quantity: nextQuantity,
      },
    });

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, quantity: number) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, product: true },
    });

    if (!item || item.cart.userId !== userId || !item.cart.isActive) {
      throw new NotFoundException('Cart item not found');
    }

    this.ensureProductActive(item.product.isActive);
    this.ensureStock(item.product.stockQty, quantity);

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });

    if (!item || item.cart.userId !== userId || !item.cart.isActive) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });

    if (!cart) {
      return { cleared: true, cart: null };
    }

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { cleared: true, cart: await this.getCart(userId) };
  }

  private async getOrCreateCart(userId: string) {
    const existing = await this.prisma.cart.findFirst({
      where: { userId, isActive: true },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              include: {
                catalog: {
                  include: { brand: true },
                },
              },
            },
          },
        },
      },
    });

    if (existing) return existing;

    return this.prisma.cart.create({
      data: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              include: {
                catalog: {
                  include: { brand: true },
                },
              },
            },
          },
        },
      },
    });
  }

  private async requirePurchasableProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        catalog: {
          include: { brand: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    this.ensureProductActive(product.isActive);
    this.ensureStock(product.stockQty, 1);
    return product;
  }

  private ensureProductActive(isActive: boolean) {
    if (!isActive) {
      throw new BadRequestException('Product is not available');
    }
  }

  private ensureStock(stockQty: number, quantity: number) {
    if (stockQty < quantity) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }
  }

  private toCartResponse(
    cart: Awaited<ReturnType<CartService['getOrCreateCart']>>,
  ) {
    const items = cart.items.map((item) => {
      const lineTotal = Number(item.product.price) * item.quantity;
      return {
        id: item.id,
        quantity: item.quantity,
        lineTotal,
        product: {
          id: item.product.id,
          price: item.product.price,
          stockQty: item.product.stockQty,
          conditionGrade: item.product.conditionGrade,
          storageVariant: item.product.storageVariant,
          color: item.product.color,
          brand: item.product.catalog.brand.name,
          model: item.product.catalog.model,
          thumbnailUrl: item.product.catalog.stockImageUrl,
        },
      };
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      id: cart.id,
      userId: cart.userId,
      isActive: cart.isActive,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      totalQuantity,
      subtotal,
      items,
    };
  }
}
