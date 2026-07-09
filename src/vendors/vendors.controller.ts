import { Body, Controller, Delete, Get, Post, UseGuards, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { VendorsService } from './vendors.service';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';

@ApiTags('vendors')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Authenticated vendor profile + KYC summary' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.getMe(user.id);
  }

  @Get('me/onboarding-status')
  @ApiOperation({ summary: 'KYC onboarding tracker (4 steps)' })
  onboardingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.onboardingStatus(user.id);
  }

  @Post('me/kyc')
  @ApiOperation({ summary: 'Submit KYC documents for review (KYC step 2)' })
  submitKyc(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitKycDto) {
    return this.vendors.submitKyc(user.id, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Close (soft-delete) the authenticated vendor account' })
  deleteMe(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.deleteMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update store profile (store info + owner name/email)' })
  updateProfile(
  @CurrentUser() user: AuthenticatedUser,
  @Body() dto: UpdateVendorProfileDto,) {
    return this.vendors.updateProfile(user.id, dto);
  }
}
