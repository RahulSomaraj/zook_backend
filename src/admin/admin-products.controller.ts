import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminVendorProductsService } from './admin-vendor-products.service';
import { RejectProductDto } from './dto/reject-product.dto';

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

  @Post(':productId/approve')
  @ApiOperation({ summary: 'Approve a listing (publishes it to buyers)' })
  approve(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.products.approve(productId);
  }

  @Post(':productId/reject')
  @ApiOperation({ summary: 'Reject a listing with a reason (takes it down)' })
  reject(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: RejectProductDto,
  ) {
    return this.products.reject(productId, dto.reason);
  }
}
