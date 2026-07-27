import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateCustomerSettingsDto } from './dto/update-customer-settings.dto';
import { CustomerSettingsService } from './customer-settings.service';

@ApiTags('customer-settings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('customers/me/settings')
export class CustomerSettingsController {
  constructor(private readonly settings: CustomerSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get language preference' })
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.getSettings(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update language preference' })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerSettingsDto,
  ) {
    return this.settings.updateSettings(user.id, dto);
  }
}
