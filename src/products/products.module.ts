import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [VendorsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
