import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminFeeSettingsService } from './admin-fee-settings.service';
import { SetFeeSettingsDto } from './dto/set-fee-settings.dto';

@ApiTags('admin-fee-settings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/fee-settings')
export class AdminFeeSettingsController {
  constructor(private readonly fees: AdminFeeSettingsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set platform commission and Mamo fee percentages',
    description:
      'Creates or updates the single settings row. Both inputs and returned rates are percentages; their sum must not exceed 100. Used by vendor payout previews. Checkout continues to use its existing configured rates.',
  })
  setFees(@Body() dto: SetFeeSettingsDto) {
    return this.fees.setFees(dto);
  }
}
