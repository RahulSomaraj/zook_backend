import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('recently-listed')
  @ApiOperation({ summary: 'Get recently listed buyer-visible products' })
  @ApiQuery({ name: 'country', required: false, description: 'Filter by country ISO code (e.g. AE)' })
  recentlyListed(@Query('country') country?: string) {
    return this.products.getRecentlyListed(country);
  }

  @Get('top-picks')
  @ApiOperation({ summary: 'Get top picks buyer-visible products' })
  @ApiQuery({ name: 'country', required: false, description: 'Filter by country ISO code (e.g. AE)' })
  topPicks(@Query('country') country?: string) {
    return this.products.getTopPicks(country);
  }

  @Get()
  @ApiOperation({ summary: 'List buyer-visible products, optionally filtered by category and country' })
  @ApiQuery({
    name: 'category_id',
    required: false,
    description: 'Filter products by category id',
  })
  @ApiQuery({
    name: 'country',
    required: false,
    description: 'Filter products by country ISO code (e.g. AE)',
  })
  list(
    @Query('category_id') categoryId?: string,
    @Query('country') country?: string,
  ) {
    return this.products.list(categoryId, country);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full buyer-facing product detail by id' })
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
