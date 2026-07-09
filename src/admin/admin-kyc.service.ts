import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KycStatus } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { ListKycQueryDto } from './dto/list-kyc.dto';
import {
  ONBOARDING_STEP_CHANGED,
  OnboardingStepChangedEvent,
} from '../realtime/onboarding-events';

@Injectable()
export class AdminKycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** KYC submissions for admin review, paginated (defaults to pending). */
  async list(query: ListKycQueryDto) {
    const where = { status: query.status ?? KycStatus.pending };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.vendorKyc.count({ where }),
      this.prisma.vendorKyc.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.limit,
        include: {
          vendor: {
            select: {
              id: true,
              storeName: true,
              user: { select: { fullName: true, email: true, phone: true } },
            },
          },
        },
      }),
    ]);

    return { items, meta: buildMeta(total, query.page, query.limit) };
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

    // Emit AFTER the write commits so we never notify on a rolled-back state.
    this.emitStepChanged(kyc.vendorId, kyc.vendor.userId, 'approved', null, kyc.id);

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

    this.emitStepChanged(kyc.vendorId, kyc.vendor.userId, 'rejected', reason, kyc.id);

    return { id: kyc.id, status: KycStatus.rejected };
  }

  /** Build and publish the onboarding `kyc` step-change event. */
  private emitStepChanged(
    vendorId: string,
    userId: string,
    status: 'approved' | 'rejected',
    reason: string | null,
    kycId: string,
  ): void {
    const message =
      status === 'approved'
        ? 'Your KYC documents were approved.'
        : `Your KYC was rejected${reason ? `: ${reason}.` : '.'}`;

    const event: OnboardingStepChangedEvent = {
      userId,
      vendorId,
      step: 'kyc',
      status,
      message,
      reason,
      kycId,
      occurredAt: new Date().toISOString(),
    };
    this.events.emit(ONBOARDING_STEP_CHANGED, event);
  }

  private async getReviewableOrThrow(kycId: string) {
    const kyc = await this.prisma.vendorKyc.findUnique({
      where: { id: kycId },
      // Pull the owning vendor's user id so we can target the notification.
      include: { vendor: { select: { userId: true } } },
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
