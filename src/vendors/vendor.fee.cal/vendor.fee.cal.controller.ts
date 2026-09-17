import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VendorFeeCalService } from './vendor.fee.cal.service';

@ApiTags('vendor-fee-calculation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendors/me/products')
export class VendorFeeCalController {
  constructor(private readonly vendorFeeCalService: VendorFeeCalService) {}

  @Get(':productId/payout')
  @ApiOperation({
    summary: 'Preview the vendor payout for one unit of an owned product',
    description:
      'Uses the current product price and platform fee settings. Returns salePrice, commissionRate, commission, processingFee (Mamo), and payoutAmount as decimal strings. This is an estimate, not an order payout or a transfer.',
  })
  calculatePayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.vendorFeeCalService.calculateFees(productId, user.id);
  }
}
