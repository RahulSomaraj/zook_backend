import { Module } from '@nestjs/common';
import { AdminKycController } from './admin-kyc.controller';
import { AdminKycService } from './admin-kyc.service';
import { AdminVendorsController } from './admin-vendors.controller';
import { AdminVendorsService } from './admin-vendors.service';

@Module({
  controllers: [AdminKycController, AdminVendorsController],
  providers: [AdminKycService, AdminVendorsService],
})
export class AdminModule {}
