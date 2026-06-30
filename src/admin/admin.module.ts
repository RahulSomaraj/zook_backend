import { Module } from '@nestjs/common';
import { AdminBrandsController } from './admin-brands.controller';
import { AdminBrandsService } from './admin-brands.service';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminKycController } from './admin-kyc.controller';
import { AdminKycService } from './admin-kyc.service';
import { AdminVendorsController } from './admin-vendors.controller';
import { AdminVendorsService } from './admin-vendors.service';

@Module({
  controllers: [
    AdminKycController,
    AdminVendorsController,
    AdminCatalogController,
    AdminBrandsController,
    AdminCategoriesController,
  ],
  providers: [
    AdminKycService,
    AdminVendorsService,
    AdminCatalogService,
    AdminBrandsService,
    AdminCategoriesService,
  ],
})
export class AdminModule {}
