import { Module } from '@nestjs/common';
import { VendorFeeCalService } from './vendor.fee.cal.service';
import { VendorFeeCalController } from './vendor.fee.cal.controller';

@Module({
  controllers: [VendorFeeCalController],
  providers: [VendorFeeCalService],
})
export class VendorFeeCalModule {}
