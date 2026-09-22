import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CalculateFeesDto } from './dto/calculate-fees.dto';
import { VendorFeeCalService } from './vendor.fee.cal.service';

@ApiTags('vendor-fee-calculation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendors/me')
export class VendorFeeCalController {
  constructor(private readonly vendorFeeCalService: VendorFeeCalService) {}

  @Get('fee-settings')
  @ApiOperation({
    summary: 'Get the current platform commission and Mamo fee percentages',
    description:
      'Returns both fees as percentages (for example, 10 and 2.9). Returns 404 if settings have not been configured.',
  })
  getFees() {
    return this.vendorFeeCalService.getFees();
  }

  @Post('payout-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview the vendor payout for a frontend-supplied listing price',
    description:
      'Accepts a productPrice in AED and applies the current platform fee settings. Returns salePrice, commissionRate, commission, processingFee (Mamo), and payoutAmount as decimal strings. This is an estimate, not an order payout or a transfer.',
  })
  calculatePayout(@Body() dto: CalculateFeesDto) {
    return this.vendorFeeCalService.calculateFees(dto.productPrice);
  }
}
