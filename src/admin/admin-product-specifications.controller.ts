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
import { AdminProductSpecificationsService } from './admin-product-specifications.service';
import { CreateProductSpecificationDto } from './dto/create-product-specification.dto';
import { ListProductSpecificationQueryDto } from './dto/list-product-specification.dto';
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
  @ApiOperation({
    summary: 'Add a specification to a catalog product',
    description:
      "Send `specId` to answer one of the fields defined for the catalog product's category (the label is copied from that definition), or `label` for a one-off attribute the category does not define. Exactly one of the two.",
  })
  create(
    @Param('catalogId', ParseUUIDPipe) catalogId: string,
    @Body() dto: CreateProductSpecificationDto,
  ) {
    return this.specs.create(catalogId, dto);
  }

  @Get('product-specifications')
  @ApiOperation({
    summary: 'List specifications across all catalog products (no id needed)',
    description:
      'Flat, paginated listing of every spec row with the product it belongs to — product name, label and value. Filter with `search` (matches model, label or value), `categoryId`, `catalogId`, or `linkedOnly`.',
  })
  listAll(@Query() query: ListProductSpecificationQueryDto) {
    return this.specs.listAll(query);
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
