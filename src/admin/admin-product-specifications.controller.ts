import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminProductSpecificationsService } from './admin-product-specifications.service';
import { CreateProductSpecificationDto } from './dto/create-product-specification.dto';
import { UpdateProductSpecificationDto } from './dto/update-product-specification.dto';

@ApiTags('admin-product-specifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminProductSpecificationsController {
  constructor(private readonly specs: AdminProductSpecificationsService) {}

  @Get('catalog/:catalogId/specifications')
  @ApiOperation({ summary: 'List specifications for a catalog product' })
  list(@Param('catalogId', ParseUUIDPipe) catalogId: string) {
    return this.specs.list(catalogId);
  }

  @Post('catalog/:catalogId/specifications')
  @ApiOperation({ summary: 'Add a specification to a catalog product' })
  create(
    @Param('catalogId', ParseUUIDPipe) catalogId: string,
    @Body() dto: CreateProductSpecificationDto,
  ) {
    return this.specs.create(catalogId, dto);
  }

  @Get('product-specifications/:id')
  @ApiOperation({ summary: 'Specification detail' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.specs.getById(id);
  }

  @Patch('product-specifications/:id')
  @ApiOperation({ summary: 'Update a specification' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductSpecificationDto,
  ) {
    return this.specs.update(id, dto);
  }

  @Delete('product-specifications/:id')
  @ApiOperation({ summary: 'Delete a specification' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.specs.remove(id);
  }
}
