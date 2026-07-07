import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, ProductSource } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getVendorId(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor.id;
  }

  async create(userId: string, dto: CreateListingDto) {
    const vendorId = await this.getVendorId(userId);

    const catalogItem = await this.prisma.productCatalog.findFirst({
      where: { id: dto.catalogId, deletedAt: null, status: CatalogStatus.active },
    });
    if (!catalogItem) throw new NotFoundException('Catalog item not found');

    return this.prisma.product.create({
      data: {
        vendorId,
        catalogId: dto.catalogId,
        source: ProductSource.vendor,
        conditionGrade: dto.conditionGrade,
        storageVariant: dto.storageVariant,
        color: dto.color,
        inspectionImages: dto.inspectionImages ?? [],
        description: dto.description,
        price: dto.price,
        stockQty: dto.stockQty,
      },
    });
  }

  async findAll(userId: string, query: QueryListingsDto) {
    const vendorId = await this.getVendorId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: any = { vendorId };
    if (query.status === 'live') {
      where.isActive = true;
      where.stockQty = { gt: 0 };
    } else if (query.status === 'paused') {
      where.isActive = false;
    } else if (query.status === 'low_stock') {
      where.isActive = true;
      where.stockQty = { gt: 0, lte: 3 };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { catalog: { include: { brand: true, category: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const vendorId = await this.getVendorId(userId);
    const product = await this.prisma.product.findFirst({
      where: { id, vendorId },
      include: { catalog: { include: { brand: true, category: true } } },
    });
    if (!product) throw new NotFoundException('Listing not found');
    return product;
  }

  async update(userId: string, id: string, dto: UpdateListingDto) {
    const vendorId = await this.getVendorId(userId);
    const existing = await this.prisma.product.findFirst({ where: { id, vendorId } });
    if (!existing) throw new NotFoundException('Listing not found');

    return this.prisma.product.update({ where: { id }, data: { ...dto } });
  }

  async remove(userId: string, id: string) {
    const vendorId = await this.getVendorId(userId);
    const existing = await this.prisma.product.findFirst({ where: { id, vendorId } });
    if (!existing) throw new NotFoundException('Listing not found');

    await this.prisma.product.delete({ where: { id } });
    return { id, deleted: true };
  }
}