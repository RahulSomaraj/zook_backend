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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse products — filters, search, pagination' })
  findAll(@Query() query: QueryProductsDto) {
    return this.products.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single product with catalog details' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOne(id);
  }

  @Post()
  @Roles(Role.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a vendor listing' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateProductDto) {
    return this.products.create(userId, dto);
  }

  @Patch(':id')
  @Roles(Role.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update an owned listing' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(userId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.VENDOR)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deactivate an owned listing (soft delete)' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.products.remove(userId, id);
  }
}
