import { Injectable } from '@nestjs/common';
import { computePayoutBreakdown } from '../../common/utils/payout.util';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class VendorFeeCalService {
  constructor(private readonly prisma: PrismaService) {}

  public async calculateFees(productId: string) {
    const { price } = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { price: true },
    });

    const { commissionRate, mamoFeeRate: mamoRate } =
      await this.prisma.feeSettings.findUniqueOrThrow({
        where: { id: 1 },
        select: {
          commissionRate: true,
          mamoFeeRate: true,
        },
      });
    return computePayoutBreakdown(price, commissionRate, mamoRate);
  }
}
