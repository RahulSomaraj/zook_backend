import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { ListVendorsQueryDto } from './dto/list-vendors.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class AdminVendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated, filterable, searchable vendor list. Hides archived rows unless asked. */
  async list(query: ListVendorsQueryDto) {
    const where: Prisma.VendorWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.status) where.status = query.status;
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { storeName: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { phone: { contains: q } } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.vendor.count({ where }),
      this.prisma.vendor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } },
          _count: { select: { products: true } },
        },
      }),
    ]);

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  /** Full vendor detail: owner, latest KYC submission, product count. */
  async detail(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            phoneVerified: true,
            createdAt: true,
          },
        },
        kyc: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { products: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  /** Update editable fields (PATCH). Only provided keys change. */
  async update(id: string, dto: UpdateVendorDto) {
    await this.getActiveOrThrow(id);
    return this.prisma.vendor.update({
      where: { id },
      data: {
        storeName: dto.storeName,
        storeAddress: dto.storeAddress,
        storeLogoUrl: dto.storeLogoUrl,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        commissionRate: dto.commissionRate,
        status: dto.status,
        strikeCount: dto.strikeCount,
      },
    });
  }

  /** Soft delete: archive the vendor (set deletedAt). Idempotency guarded. */
  async softDelete(id: string) {
    await this.getActiveOrThrow(id);
    await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id, deleted: true };
  }

  /** Restore a previously soft-deleted vendor. */
  async restore(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (!vendor.deletedAt) {
      throw new ConflictException('Vendor is not archived');
    }
    await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: null },
    });
    return { id, restored: true };
  }

  /** Fetch a non-archived vendor or throw. */
  private async getActiveOrThrow(id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.deletedAt) {
      throw new ConflictException('Vendor is archived; restore it first');
    }
    return vendor;
  }
}
