import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminVendorProductsService } from './admin-vendor-products.service';

@ApiTags('admin-products')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: AdminVendorProductsService) {}

  @Get(':productId')
  @ApiOperation({ summary: 'Get a product by ID' })
  findOne(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.products.findOne(productId);
  }
}
