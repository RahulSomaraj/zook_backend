import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdressesService } from './adresses.service';
import { CreateAdressDto } from './dto/create-adress.dto';
import { UpdateAdressDto } from './dto/update-adress.dto';

@ApiTags('customer-addresses')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@Controller('customers/addresses')
export class AdressesController {
  constructor(private readonly adressesService: AdressesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a customer delivery address' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createAdressDto: CreateAdressDto,
  ) {
    return this.adressesService.create(user.id, createAdressDto);
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated customer addresses' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.adressesService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single customer address by id' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adressesService.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer delivery address' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateAdressDto: UpdateAdressDto,
  ) {
    return this.adressesService.update(user.id, id, updateAdressDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a customer address' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.adressesService.remove(user.id, id);
  }
}
