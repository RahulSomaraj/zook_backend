import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminKycService } from './admin-kyc.service';
import { RejectKycDto } from './dto/reject-kyc.dto';

@ApiTags('admin-kyc')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/vendor-kyc')
export class AdminKycController {
  constructor(private readonly adminKyc: AdminKycService) {}

  @Get()
  @ApiOperation({ summary: 'List vendor KYC submissions pending review' })
  listPending() {
    return this.adminKyc.listPending();
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a KYC submission (documents only; does not activate the store)' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.adminKyc.approve(id, user.id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a KYC submission with a reason' })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectKycDto,
  ) {
    return this.adminKyc.reject(id, user.id, dto.reason);
  }
}
