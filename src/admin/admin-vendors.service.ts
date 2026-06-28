import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  KycStatus,
  Prisma,
  Role as DbRole,
  VendorStatus,
} from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { normalizePhone } from '../common/utils/phone.util';
import { PrismaService } from '../database/prisma.service';
import {
  ONBOARDING_STEP_CHANGED,
  OnboardingStepChangedEvent,
} from '../realtime/onboarding-events';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { ListVendorsQueryDto } from './dto/list-vendors.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class AdminVendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

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

  /**
   * Admin-create a vendor: provisions the user, the vendor role grant and the
   * vendor record in one transaction. The vendor can later sign in via OTP.
   */
  async create(dto: CreateVendorDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = normalizePhone(dto.phone);

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'An account with this email or phone already exists',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, phone, fullName: dto.ownerFullName },
      });
      await tx.userRole.create({
        data: { userId: user.id, role: DbRole.vendor },
      });
      return tx.vendor.create({
        data: {
          userId: user.id,
          storeName: dto.storeName,
          storeAddress: dto.storeAddress,
          commissionRate: dto.commissionRate,
          status: dto.status ?? VendorStatus.pending,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true } },
        },
      });
    });
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

  /**
   * Activate (approve) the vendor's store. Gated: the vendor's latest KYC must
   * be approved first. This is the second step after document approval, so the
   * "documents approved -> vendor approved" transition is explicit.
   */
  async activate(id: string) {
    const vendor = await this.getActiveOrThrow(id);
    if (vendor.status === VendorStatus.approved) {
      throw new ConflictException('Vendor is already approved');
    }

    const latestKyc = await this.prisma.vendorKyc.findFirst({
      where: { vendorId: id },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (latestKyc?.status !== KycStatus.approved) {
      throw new ConflictException(
        'Vendor documents must be approved before the store can be activated',
      );
    }

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: { status: VendorStatus.approved },
    });

    // Notify the vendor that the final onboarding step (store activation) is done.
    const event: OnboardingStepChangedEvent = {
      userId: vendor.userId,
      vendorId: vendor.id,
      step: 'store_activation',
      status: 'approved',
      reason: null,
      kycId: null,
      occurredAt: new Date().toISOString(),
    };
    this.events.emit(ONBOARDING_STEP_CHANGED, event);

    return updated;
  }

  /** Suspend a vendor's store. */
  async suspend(id: string) {
    await this.getActiveOrThrow(id);
    return this.prisma.vendor.update({
      where: { id },
      data: { status: VendorStatus.suspended },
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
