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

  public async calculateFees(productId: string, userId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        source: 'vendor',
        vendor: { userId, deletedAt: null },
      },
      select: { price: true },
    });
    if (!product) throw new NotFoundException('Product not found');

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
      product.price,
      settings.commissionRate,
      settings.mamoFeeRate,
    );
  }
}
