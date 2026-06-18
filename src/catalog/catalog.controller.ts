import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { QueryCatalogDto } from './dto/query-catalog.dto';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search the master product catalog' })
  findAll(@Query() query: QueryCatalogDto) {
    return this.catalog.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a catalog entry (brand, model, specs, image)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.findOne(id);
  }
}
