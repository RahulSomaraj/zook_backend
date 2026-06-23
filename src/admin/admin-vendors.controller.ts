import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminVendorsService } from './admin-vendors.service';
import { ListVendorsQueryDto } from './dto/list-vendors.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@ApiTags('admin-vendors')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(private readonly vendors: AdminVendorsService) {}

  @Get()
  @ApiOperation({ summary: 'List vendors (paginated, filter by status, search)' })
  list(@Query() query: ListVendorsQueryDto) {
    return this.vendors.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Vendor detail (owner, latest KYC, product count)' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update vendor fields (also approve/suspend via status)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendors.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (archive) a vendor' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.softDelete(id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted vendor' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendors.restore(id);
  }
}
