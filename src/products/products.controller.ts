import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { QueryProductsDto } from './dto/query-products.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('recently-listed')
  @ApiOperation({
    deprecated: true,
    summary: 'DEPRECATED — use GET /products?sort=recent&limit=20',
  })
  @ApiQuery({ name: 'country', required: false, description: 'Filter by country ISO code (e.g. AE)' })
  recentlyListed(@Query('country') country?: string) {
    return this.products.getRecentlyListed(country);
  }

  @Get('top-picks')
  @ApiOperation({
    deprecated: true,
    summary: 'DEPRECATED — use GET /products?sort=top_picks&limit=20',
  })
  @ApiQuery({ name: 'country', required: false, description: 'Filter by country ISO code (e.g. AE)' })
  topPicks(@Query('country') country?: string) {
    return this.products.getTopPicks(country);
  }

  @Get()
  @ApiOperation({
    summary:
      'List buyer-visible products with sort, filters and pagination. Replaces recently-listed (sort=recent) and top-picks (sort=top_picks).',
  })
  list(@Query() query: QueryProductsDto) {
    return this.products.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full buyer-facing product detail by id' })
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }
}
