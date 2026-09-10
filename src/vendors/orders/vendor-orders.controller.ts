import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttachPackPhotoDto } from './dto/attach-pack-photo.dto';
import { QueryVendorOrdersDto } from './dto/query-vendor-orders.dto';
import { RecordPackageWeightDto } from './dto/record-package-weight.dto';
import { VendorOrdersService } from './vendor-orders.service';

@ApiTags('vendor-orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendors/me/orders')
export class VendorOrdersController {
  constructor(private readonly orders: VendorOrdersService) {}

  @Get()
  @ApiOperation({
    summary:
      "List the vendor's sub-orders (paginated; filter by status, search by number/model/brand)",
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryVendorOrdersDto,
  ) {
    return this.orders.findAll(user.id, query);
  }

  @Get('recent')
  @ApiOperation({
    summary: "The vendor's most recent sub-orders (default 5)",
  })
  recentOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.recentOrders(user.id);
  }

  @Post(':id/start-packing')
  @ApiOperation({
    summary:
      'Start packing a sub-order (confirmed → preparing). Vendor CTA on the new-order screen.',
  })
  startPacking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.startPacking(user.id, id);
  }

  @Get(':id/pack-photos')
  @ApiOperation({
    summary:
      'Packing-photo state for a sub-order (which of the 2 photos are uploaded/verified)',
  })
  getPackPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.getPackPhotos(user.id, id);
  }

  @Post(':id/pack-photos')
  @ApiOperation({
    summary:
      'Attach before and/or after packing photo(s) in one call. Order must be preparing.',
  })
  attachPackPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachPackPhotoDto,
  ) {
    return this.orders.attachPackPhoto(user.id, id, dto);
  }

  @Post(':id/package-weight')
  @ApiOperation({
    summary:
      'Record the measured weight of the packed parcel in kg. Order must be preparing and not yet booked.',
  })
  recordPackageWeight(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPackageWeightDto,
  ) {
    return this.orders.recordPackageWeight(user.id, id, dto);
  }

  @Post(':id/ready-for-pickup')
  @ApiOperation({
    summary:
      'Create the Jeebly shipment and mark a packed sub-order ready for pickup (preparing → ready). Requires both photos, a recorded package weight and a verified payment or COD allocation.',
  })
  readyForPickup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.readyForPickup(user.id, id);
  }
}
