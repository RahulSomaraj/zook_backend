import { Injectable, NotFoundException } from '@nestjs/common';
import { KycStatus, VendorStatus } from '@prisma/client';
import {
  buildMeta,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vendors that have at least one pending KYC submission. */
  async pendingVendors(query: PaginationQueryDto) {
    const where = { kyc: { some: { status: KycStatus.pending } } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { email: true, fullName: true, phone: true } },
          kyc: {
            where: { status: KycStatus.pending },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.vendor.count({ where }),
    ]);
    return { data: rows, meta: buildMeta(total, query.page, query.limit) };
  }

  /** Approve the vendor's latest pending KYC and mark the vendor approved. */
  async approveVendor(vendorId: string, adminId: string) {
    const kyc = await this.latestPendingKyc(vendorId);
    return this.prisma.$transaction(async (tx) => {
      await tx.vendorKyc.update({
        where: { id: kyc.id },
        data: {
          status: KycStatus.approved,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
      return tx.vendor.update({
        where: { id: vendorId },
        data: { status: VendorStatus.approved },
      });
    });
  }

  /** Reject the latest pending KYC with a reason; vendor stays pending. */
  async rejectVendor(vendorId: string, adminId: string, reason: string) {
    const kyc = await this.latestPendingKyc(vendorId);
    await this.prisma.vendorKyc.update({
      where: { id: kyc.id },
      data: {
        status: KycStatus.rejected,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    return { vendorId, kycId: kyc.id, status: KycStatus.rejected, reason };
  }

  async suspendVendor(vendorId: string) {
    await this.requireVendor(vendorId);
    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: { status: VendorStatus.suspended },
    });
  }

  private async requireVendor(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async latestPendingKyc(vendorId: string) {
    await this.requireVendor(vendorId);
    const kyc = await this.prisma.vendorKyc.findFirst({
      where: { vendorId, status: KycStatus.pending },
      orderBy: { createdAt: 'desc' },
    });
    if (!kyc) {
      throw new NotFoundException('No pending KYC submission for this vendor');
    }
    return kyc;
  }
}
