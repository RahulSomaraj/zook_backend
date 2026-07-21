import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { QueryProductsDto } from './dto/query-product.dto';

@Injectable()
export class AdminVendorProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByVendor(vendorId: string, query: QueryProductsDto) {
    const { page = 1, limit = 20 } = query;

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const where: Prisma.ProductWhereInput = { vendorId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) throw new NotFoundException('Product not found');

    return product;
  }

  /** Approve a listing: publishes it and clears any prior rejection reason. */
  async approve(productId: string) {
    await this.ensureExists(productId);

    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.approved, rejectionReason: null },
    });
  }

  /** Reject a listing: takes it down and stores the reason for audit. */
  async reject(productId: string, reason: string) {
    await this.ensureExists(productId);

    return this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.rejected, rejectionReason: reason },
    });
  }

  private async ensureExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
  }
}
