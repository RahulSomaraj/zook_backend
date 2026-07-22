import { Module } from '@nestjs/common';
import { AdminBrandsController } from './admin-brands.controller';
import { AdminBrandsService } from './admin-brands.service';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminCountriesController } from './admin-countries.controller';
import { AdminCountriesService } from './admin-countries.service';
import { AdminKycController } from './admin-kyc.controller';
import { AdminKycService } from './admin-kyc.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminProductsController } from './admin-products.controller';
import { AdminVendorProductsController } from './admin-vendor-products.controller';
import { AdminVendorProductsService } from './admin-vendor-products.service';
import { AdminVendorsController } from './admin-vendors.controller';
import { AdminVendorsService } from './admin-vendors.service';

@Module({
  controllers: [
    AdminKycController,
    AdminOrdersController,
    AdminProductsController,
    AdminVendorProductsController,
    AdminVendorsController,
    AdminCatalogController,
    AdminBrandsController,
    AdminCategoriesController,
    AdminCountriesController,
  ],
  providers: [
    AdminKycService,
    AdminOrdersService,
    AdminVendorProductsService,
    AdminVendorsService,
    AdminCatalogService,
    AdminBrandsService,
    AdminCategoriesService,
    AdminCountriesService,
  ],
})
export class AdminModule {}
