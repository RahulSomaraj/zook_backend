import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { VendorsService } from './vendors.service';

@ApiTags('vendors')
@ApiBearerAuth('access-token')
@Roles(Role.VENDOR)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Post('apply')
  @ApiOperation({ summary: 'Submit vendor onboarding + KYC documents' })
  apply(@CurrentUser() user: AuthUser, @Body() dto: ApplyVendorDto) {
    return this.vendors.apply(user, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Check vendor approval / KYC status' })
  status(@CurrentUser('id') userId: string) {
    return this.vendors.getStatus(userId);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get the logged-in vendor profile' })
  profile(@CurrentUser('id') userId: string) {
    return this.vendors.getProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update the logged-in vendor profile' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendors.updateProfile(userId, dto);
  }
}
