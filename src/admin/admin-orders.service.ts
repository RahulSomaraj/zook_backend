import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { ListOrdersQueryDto } from './dto/list-orders.dto';

/** Sub-order row shape the admin all-orders table consumes. */
export type AdminOrderRow = ReturnType<AdminOrdersService['toRow']>;

@Injectable()
export class AdminOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated, filterable sub-order list for the admin all-orders screen.
   * `search` matches sub-order number, product model or store name. Each row
   * carries the product thumbnail (catalog stock image), vendor, courier/AWB,
   * sale price, payout and elapsed time. `hasFraudFlag` is stubbed `false`
   * until the fraud domain lands (Phase 5, item 5.1).
   */
  async list(query: ListOrdersQueryDto) {
    const where: Prisma.SubOrderWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.courier) {
      where.courierName = { contains: query.courier.trim(), mode: 'insensitive' };
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { subOrderNumber: { contains: q, mode: 'insensitive' } },
        { product: { catalog: { model: { contains: q, mode: 'insensitive' } } } },
        { vendor: { storeName: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.subOrder.count({ where }),
      this.prisma.subOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: {
          vendor: { select: { id: true, storeName: true } },
          product: {
            select: {
              id: true,
              conditionGrade: true,
              storageVariant: true,
              color: true,
              catalog: {
                select: {
                  model: true,
                  stockImageUrl: true,
                  brand: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const items = rows.map((row) => this.toRow(row));
    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  /** Flatten a sub-order + relations into the admin table row. */
  private toRow(
    row: Prisma.SubOrderGetPayload<{
      include: {
        vendor: { select: { id: true; storeName: true } };
        product: {
          select: {
            id: true;
            conditionGrade: true;
            storageVariant: true;
            color: true;
            catalog: {
              select: {
                model: true;
                stockImageUrl: true;
                brand: { select: { name: true } };
              };
            };
          };
        };
      };
    }>,
  ) {
    return {
      id: row.id,
      subOrderNumber: row.subOrderNumber,
      orderId: row.orderId,
      status: row.status,
      product: {
        id: row.product.id,
        model: row.product.catalog.model,
        brand: row.product.catalog.brand.name,
        thumbnailUrl: row.product.catalog.stockImageUrl,
        storageVariant: row.product.storageVariant,
        color: row.product.color,
        conditionGrade: row.product.conditionGrade,
      },
      // Null for C2C sub-orders (no vendor).
      vendor: row.vendor
        ? { id: row.vendor.id, storeName: row.vendor.storeName }
        : null,
      courierName: row.courierName,
      awbNumber: row.awbNumber,
      salePrice: row.salePrice,
      payoutAmount: row.payoutAmount,
      payoutStatus: row.payoutStatus,
      createdAt: row.createdAt,
      // Wall-clock time since the sub-order was created; the table renders this
      // as "elapsed"/age. Sourced from createdAt so it needs no extra query.
      elapsedMs: Date.now() - row.createdAt.getTime(),
      // TODO(5.1): join FraudFlag and surface real state.
      hasFraudFlag: false,
    };
  }
}
