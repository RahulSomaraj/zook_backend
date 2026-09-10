import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, ProductSource, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

@Injectable()
export class ListingsService {
  /** A live listing at or below this stock level is surfaced as "low-stock". */
  private static readonly LOW_STOCK_THRESHOLD = 5;

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

  const product = await this.prisma.product.create({
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

  // If a store address was supplied, persist it onto the vendor profile
  // (the address lives on the vendor, shared across listings).
  if (dto.storeAddress !== undefined) {
    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { storeAddress: dto.storeAddress },
    });
  }

  const pickupAddress = await this.getPickupAddress(userId);

  return { ...product, pickupAddress };
}

  async findAll(userId: string, query: QueryListingsDto) {
    const vendorId = await this.getVendorId(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: any = { vendorId };
    // Dashboard status buckets:
    //   all       → no filter
    //   pending   → awaiting admin approval
    //   live      → approved and active (currently listed for sale)
    //   low-stock → live with stock at or below the low-stock threshold
    switch (query.status) {
      case 'pending':
        where.status = ProductStatus.pending;
        break;
      case 'live':
        where.status = ProductStatus.approved;
        where.isActive = true;
        break;
      case 'low-stock':
        where.status = ProductStatus.approved;
        where.isActive = true;
        where.stockQty = { lte: ListingsService.LOW_STOCK_THRESHOLD };
        break;
      case 'all':
      default:
        break;
    }

    if (query.search) {
    where.OR = [
      { description: { contains: query.search, mode: 'insensitive' } },
      { color: { contains: query.search, mode: 'insensitive' } },
      { catalog: { is: { model: { contains: query.search, mode: 'insensitive' } } } },
      { catalog: { is: { brand: { is: { name: { contains: query.search, mode: 'insensitive' } } } } } },
    ];
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

    // Pickup address (area + lat/lng location) is the same for every listing,
    // so it is returned once at the top level rather than per item.
    const pickupAddress = await this.getPickupAddress(userId);

    return { items, total, page, limit, pickupAddress };
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

  async getPickupAddress(userId: string) {
    const vendorId = await this.getVendorId(userId);
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        storeAddress: true,
        pickupArea: true,
        pickupEmirate: true,
        pickupHouseNo: true,
        pickupLandmark: true,
        pickupLat: true,
        pickupLng: true,
      },
    });
    return {
      storeAddress: vendor?.storeAddress ?? null,
      pickupArea: vendor?.pickupArea ?? null,
      pickupEmirate: vendor?.pickupEmirate ?? null,
      pickupHouseNo: vendor?.pickupHouseNo ?? null,
      pickupLandmark: vendor?.pickupLandmark ?? null,
      pickupLat: vendor?.pickupLat ?? null,
      pickupLng: vendor?.pickupLng ?? null,
    };
  }
}