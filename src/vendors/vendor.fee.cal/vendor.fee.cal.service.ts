import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { computePayoutBreakdown } from '../../common/utils/payout.util';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class VendorFeeCalService {
  constructor(private readonly prisma: PrismaService) {}

  public async getFees() {
    const settings = await this.prisma.feeSettings.findUnique({
      where: { id: 1 },
      select: {
        id: true,
        commissionRate: true,
        mamoFeeRate: true,
        updatedAt: true,
      },
    });
    if (!settings) {
      throw new NotFoundException('Fee settings have not been configured');
    }
    return {
      id: settings.id,
      commissionPercentage: settings.commissionRate.toNumber(),
      mamoPercentage: settings.mamoFeeRate.mul(100).toNumber(),
      updatedAt: settings.updatedAt,
    };
  }

  public async calculateFees(productPrice: number) {
    const settings = await this.prisma.feeSettings.findUnique({
      where: { id: 1 },
      select: {
        commissionRate: true,
        mamoFeeRate: true,
      },
    });
    if (!settings) {
      throw new ServiceUnavailableException(
        'Fee settings have not been configured',
      );
    }
    return computePayoutBreakdown(
      productPrice,
      settings.commissionRate,
      settings.mamoFeeRate,
    );
  }
}
