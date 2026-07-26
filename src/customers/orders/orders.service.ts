import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductSource } from '@prisma/client';
import { computePayoutBreakdown } from '../../common/utils/payout.util';
import { PrismaService } from '../../database/prisma.service';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findFirst({
      where: { userId, isActive: true },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              include: {
                vendor: true,
                catalog: {
                  include: { brand: true },
                },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException({ message: 'Cart is empty', code: 'CART_EMPTY' });
    }

    const mamoFeeRate = this.config.get<number>('payments.mamoFeeRate') ?? 0.029;

    return this.prisma.$transaction(async (tx) => {
      const productIds = cart.items.map((item) => item.productId);
      const latestProducts = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: {
          vendor: true,
          catalog: {
            include: { brand: true },
          },
        },
      });

      if (latestProducts.length !== productIds.length) {
        throw new NotFoundException({ message: 'One or more cart products no longer exist', code: 'PRODUCT_NOT_FOUND' });
      }

      const productById = new Map(latestProducts.map((product) => [product.id, product]));

      let subtotal = new Prisma.Decimal(0);
      const preparedItems = cart.items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) {
          throw new NotFoundException({ message: `Product ${item.productId} not found`, code: 'PRODUCT_NOT_FOUND' });
        }

        if (!product.isActive) {
          throw new BadRequestException({
            message: `Product "${product.catalog.brand.name} ${product.catalog.model}" is no longer available`,
            code: 'PRODUCT_UNAVAILABLE',
          });
        }

        if (product.stockQty < item.quantity) {
          throw new BadRequestException({
            message: `Only ${product.stockQty} unit(s) left for "${product.catalog.brand.name} ${product.catalog.model}"`,
            code: 'INSUFFICIENT_STOCK',
          });
        }

        const salePrice = new Prisma.Decimal(product.price).mul(item.quantity);
        subtotal = subtotal.plus(salePrice);

        const commissionRate =
          product.source === ProductSource.vendor && product.vendor
            ? product.vendor.commissionRate
            : new Prisma.Decimal(0);
        const payout = computePayoutBreakdown(salePrice, commissionRate, mamoFeeRate);

        return {
          cartItemId: item.id,
          quantity: item.quantity,
          product,
          salePrice: payout.salePrice,
          commissionRate: payout.commissionRate,
          processingFee: payout.processingFee,
          payoutAmount: payout.payoutAmount,
        };
      });

      const deliveryFee = new Prisma.Decimal(0);
      const totalAmount = subtotal.plus(deliveryFee);
      const orderNumber = this.makeOrderNumber();

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: userId,
          addressId: dto.addressId ?? null,
          paymentId: dto.paymentId ?? null,
          subtotal,
          deliveryFee,
          totalAmount,
          estimatedDeliveryAt: this.estimateDeliveryDate(),
        },
      });

      const subOrders: Array<{
        id: string;
        subOrderNumber: string;
        status: string;
        quantity: number;
        salePrice: number;
        processingFee: number;
        payoutAmount: number;
        product: {
          id: string;
          brand: string;
          model: string;
          thumbnailUrl: string | null;
          conditionGrade: string;
          storageVariant: string | null;
          color: string | null;
        };
        vendor: {
          id: string;
          storeName: string;
        } | null;
      }> = [];
      for (const item of preparedItems) {
        const subOrder = await tx.subOrder.create({
          data: {
            subOrderNumber: this.makeSubOrderNumber(),
            orderId: order.id,
            vendorId: item.product.vendorId,
            productId: item.product.id,
            salePrice: item.salePrice,
            commissionRate: item.commissionRate,
            processingFee: item.processingFee,
            payoutAmount: item.payoutAmount,
            statusHistory: {
              create: {
                status: 'confirmed',
                actorId: userId,
                note: 'Checkout completed',
              },
            },
          },
        });

        await tx.product.update({
          where: { id: item.product.id },
          data: { stockQty: { decrement: item.quantity } },
        });

        subOrders.push({
          id: subOrder.id,
          subOrderNumber: subOrder.subOrderNumber,
          status: subOrder.status,
          quantity: item.quantity,
          salePrice: Number(item.salePrice),
          processingFee: Number(item.processingFee),
          payoutAmount: Number(item.payoutAmount),
          product: {
            id: item.product.id,
            brand: item.product.catalog.brand.name,
            model: item.product.catalog.model,
            thumbnailUrl: item.product.catalog.stockImageUrl,
            conditionGrade: item.product.conditionGrade,
            storageVariant: item.product.storageVariant,
            color: item.product.color,
          },
          vendor: item.product.vendor
            ? {
                id: item.product.vendor.id,
                storeName: item.product.vendor.storeName,
              }
            : null,
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: { isActive: false },
      });

      return this.toOrderResponse({
        id: order.id,
        orderNumber: order.orderNumber,
        addressId: order.addressId,
        paymentId: order.paymentId,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        estimatedDeliveryAt: order.estimatedDeliveryAt,
        createdAt: order.createdAt,
        subOrders,
      });
    });
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        subOrders: {
          orderBy: { createdAt: 'asc' },
          include: {
            vendor: {
              select: {
                id: true,
                storeName: true,
              },
            },
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

    if (!order) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }

    return this.toOrderResponse({
      id: order.id,
      orderNumber: order.orderNumber,
      addressId: order.addressId,
      paymentId: order.paymentId,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      totalAmount: order.totalAmount,
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      createdAt: order.createdAt,
      subOrders: order.subOrders.map((subOrder) => ({
        id: subOrder.id,
        subOrderNumber: subOrder.subOrderNumber,
        status: subOrder.status,
        quantity: 1,
        salePrice: subOrder.salePrice,
        processingFee: subOrder.processingFee,
        payoutAmount: subOrder.payoutAmount,
        product: {
          id: subOrder.product.id,
          brand: subOrder.product.catalog.brand.name,
          model: subOrder.product.catalog.model,
          thumbnailUrl: subOrder.product.catalog.stockImageUrl,
          conditionGrade: subOrder.product.conditionGrade,
          storageVariant: subOrder.product.storageVariant,
          color: subOrder.product.color,
        },
        vendor: subOrder.vendor
          ? {
              id: subOrder.vendor.id,
              storeName: subOrder.vendor.storeName,
            }
          : null,
      })),
    });
  }

  private makeOrderNumber() {
    return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;
  }

  private makeSubOrderNumber() {
    return `SUB-${Date.now()}-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;
  }

  private estimateDeliveryDate() {
    const delivery = new Date();
    delivery.setDate(delivery.getDate() + 3);
    return delivery;
  }

  private toOrderResponse(order: {
    id: string;
    orderNumber: string;
    addressId: string | null;
    paymentId: string | null;
    subtotal: Prisma.Decimal;
    deliveryFee: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    estimatedDeliveryAt: Date | null;
    createdAt: Date;
    subOrders: Array<{
      id: string;
      subOrderNumber: string;
      status: string;
      quantity: number;
      salePrice: Prisma.Decimal | number;
      processingFee: Prisma.Decimal | number;
      payoutAmount: Prisma.Decimal | number;
      product: {
        id: string;
        brand: string;
        model: string;
        thumbnailUrl: string | null;
        conditionGrade: string;
        storageVariant: string | null;
        color: string | null;
      };
      vendor: {
        id: string;
        storeName: string;
      } | null;
    }>;
  }) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      addressId: order.addressId,
      paymentId: order.paymentId,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      totalAmount: Number(order.totalAmount),
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      createdAt: order.createdAt,
      subOrders: order.subOrders.map((subOrder) => ({
        ...subOrder,
        salePrice: Number(subOrder.salePrice),
        processingFee: Number(subOrder.processingFee),
        payoutAmount: Number(subOrder.payoutAmount),
      })),
    };
  }
}
