import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SetFeeSettingsDto } from './dto/set-fee-settings.dto';

@Injectable()
export class AdminFeeSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async setFees(dto: SetFeeSettingsDto) {
    const commissionRate = new Prisma.Decimal(dto.commissionPercentage);
    const mamoPercentage = new Prisma.Decimal(dto.mamoPercentage);
    if (commissionRate.plus(mamoPercentage).gt(100)) {
      throw new BadRequestException(
        'Combined fee percentages must not exceed 100',
      );
    }

    const data = {
      commissionRate,
      mamoFeeRate: mamoPercentage.div(100),
    };
    const settings = await this.prisma.feeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });

    return {
      id: settings.id,
      commissionPercentage: settings.commissionRate.toNumber(),
      mamoPercentage: settings.mamoFeeRate.mul(100).toNumber(),
      updatedAt: settings.updatedAt,
    };
  }
}
