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
import { AdminBrandsService } from './admin-brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { ListBrandQueryDto } from './dto/list-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@ApiTags('admin-brands')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/brands')
export class AdminBrandsController {
  constructor(private readonly brands: AdminBrandsService) {}

  @Get()
  @ApiOperation({ summary: 'List brands (paginated; filter by isActive, search)' })
  list(@Query() query: ListBrandQueryDto) {
    return this.brands.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a brand' })
  create(@Body() dto: CreateBrandDto) {
    return this.brands.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Brand detail (with catalog count)' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update brand fields' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandDto) {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (archive) a brand' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.softDelete(id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted brand' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.restore(id);
  }
}
