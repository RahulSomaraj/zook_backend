import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';
import { RejectVendorDto } from './dto/review-vendor.dto';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('vendors/pending')
  @ApiOperation({ summary: 'List vendors with pending KYC' })
  pending(@Query() query: PaginationQueryDto) {
    return this.admin.pendingVendors(query);
  }

  @Patch('vendors/:id/approve')
  @ApiOperation({ summary: 'Approve a vendor (and its pending KYC)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.admin.approveVendor(id, adminId);
  }

  @Patch('vendors/:id/reject')
  @ApiOperation({ summary: 'Reject a vendor KYC submission with a reason' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: RejectVendorDto,
  ) {
    return this.admin.rejectVendor(id, adminId, dto.reason);
  }

  @Patch('vendors/:id/suspend')
  @ApiOperation({ summary: 'Suspend a vendor account' })
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.suspendVendor(id);
  }
}
