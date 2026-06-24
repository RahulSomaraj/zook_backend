import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminKycService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pending KYC submissions awaiting admin review. */
  async listPending() {
    const items = await this.prisma.vendorKyc.findMany({
      where: { status: KycStatus.pending },
      orderBy: { createdAt: 'asc' },
      include: {
        vendor: {
          select: {
            id: true,
            storeName: true,
            user: { select: { fullName: true, email: true, phone: true } },
          },
        },
      },
    });
    return { count: items.length, items };
  }

  /**
   * Approve a KYC submission (documents only). This does NOT activate the
   * vendor's store — that is a separate step (POST /admin/vendors/:id/activate),
   * so "documents approved" and "vendor approved" are distinct, visible states.
   */
  async approve(kycId: string, adminUserId: string) {
    const kyc = await this.getReviewableOrThrow(kycId);

    await this.prisma.vendorKyc.update({
      where: { id: kyc.id },
      data: {
        status: KycStatus.approved,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    return { id: kyc.id, status: KycStatus.approved };
  }

  /** Reject a KYC submission with a reason; the vendor can resubmit. */
  async reject(kycId: string, adminUserId: string, reason: string) {
    const kyc = await this.getReviewableOrThrow(kycId);

    await this.prisma.vendorKyc.update({
      where: { id: kyc.id },
      data: {
        status: KycStatus.rejected,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    return { id: kyc.id, status: KycStatus.rejected };
  }

  private async getReviewableOrThrow(kycId: string) {
    const kyc = await this.prisma.vendorKyc.findUnique({
      where: { id: kycId },
    });
    if (!kyc) throw new NotFoundException('KYC submission not found');
    if (kyc.status !== KycStatus.pending) {
      throw new BadRequestException(
        `KYC is already ${kyc.status}; only pending submissions can be reviewed`,
      );
    }
    return kyc;
  }
}
