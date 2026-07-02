import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOrdersService } from './admin-orders.service';
import { ListOrdersQueryDto } from './dto/list-orders.dto';

@ApiTags('admin-orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  @ApiOperation({
    summary:
      'List sub-orders (paginated; filter by status, vendor, courier, search, date range)',
  })
  list(@Query() query: ListOrdersQueryDto) {
    return this.orders.list(query);
  }
}
