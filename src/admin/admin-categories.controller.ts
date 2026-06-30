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
import { AdminCategoriesService } from './admin-categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoryQueryDto } from './dto/list-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('admin-categories')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories (paginated; filter by isActive, search)' })
  list(@Query() query: ListCategoryQueryDto) {
    return this.categories.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Category detail (with catalog count)' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category fields' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (archive) a category' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.softDelete(id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted category' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.restore(id);
  }
}
