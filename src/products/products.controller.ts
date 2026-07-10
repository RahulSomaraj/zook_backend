import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('recently-listed')
  @ApiOperation({ summary: 'Get recently listed buyer-visible products' })
  recentlyListed() {
    return this.products.getRecentlyListed();
  }

  @Get('top-picks')
  @ApiOperation({ summary: 'Get top picks buyer-visible products' })
  topPicks() {
    return this.products.getTopPicks();
  }

  @Get()
  @ApiOperation({ summary: 'List buyer-visible products, optionally filtered by category' })
  @ApiQuery({
    name: 'category_id',
    required: false,
    description: 'Filter products by category id',
  })
  list(@Query('category_id') categoryId?: string) {
    return this.products.list(categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full buyer-facing product detail by id' })
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
