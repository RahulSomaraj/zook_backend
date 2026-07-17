import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminVendorProductsService } from './admin-vendor-products.service';
import { QueryProductsDto } from './dto/query-product.dto';

@ApiTags('admin-vendor-products')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/vendors/:vendorId/products')
export class AdminVendorProductsController {
  constructor(private readonly products: AdminVendorProductsService) {}

  @Get()
  @ApiOperation({ summary: "List a vendor's products (paginated)" })
  findAll(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Query() query: QueryProductsDto,
  ) {
    return this.products.findAllByVendor(vendorId, query);
  }

}
