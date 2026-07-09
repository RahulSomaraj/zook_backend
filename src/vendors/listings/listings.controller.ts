import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CreateListingDto } from './dto/create-listing.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingsService } from './listings.service';

@ApiTags('vendor-listings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@Controller('vendors/me/listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new listing from a catalog item' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateListingDto) {
    return this.listings.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the vendor's own listings" })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryListingsDto) {
    return this.listings.findAll(user.id, query);
  }

  @Get('pickup-address')
  @ApiOperation({ summary: "Vendor's pickup address (from store profile)" })
  getPickupAddress(@CurrentUser() user: AuthenticatedUser) {
   return this.listings.getPickupAddress(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single listing detail' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.listings.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update listing (price, stock, pause/unpause)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listings.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a listing' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.listings.remove(user.id, id);
  }

  
}