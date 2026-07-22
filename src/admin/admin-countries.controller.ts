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
import { AdminCountriesService } from './admin-countries.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { ListCountryQueryDto } from './dto/list-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@ApiTags('admin-countries')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/countries')
export class AdminCountriesController {
  constructor(private readonly countries: AdminCountriesService) {}

  @Get()
  @ApiOperation({ summary: 'List countries (paginated; filter by isActive, search)' })
  list(@Query() query: ListCountryQueryDto) {
    return this.countries.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a country (with its currency)' })
  create(@Body() dto: CreateCountryDto) {
    return this.countries.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Country detail' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.countries.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update country / currency fields' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCountryDto) {
    return this.countries.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (archive) a country' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.countries.softDelete(id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted country' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.countries.restore(id);
  }
}
