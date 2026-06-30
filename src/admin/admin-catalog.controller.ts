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
import { AdminCatalogService } from './admin-catalog.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { ListCatalogQueryDto } from './dto/list-catalog.dto';
import { UpdateCatalogProductDto } from './dto/update-catalog-product.dto';

@ApiTags('admin-catalog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'List catalog products (paginated; filter by status/category/brand, search)',
  })
  list(@Query() query: ListCatalogQueryDto) {
    return this.catalog.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a catalog product' })
  create(@Body() dto: CreateCatalogProductDto) {
    return this.catalog.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Catalog product detail (with active-listing count)' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update catalog product fields' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogProductDto,
  ) {
    return this.catalog.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (archive) a catalog product' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.softDelete(id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted catalog product' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.restore(id);
  }
}
