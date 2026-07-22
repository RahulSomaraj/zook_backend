import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CountriesService } from './countries.service';

@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  @ApiOperation({ summary: 'List active countries with their currency (for the country/currency picker)' })
  findAll() {
    return this.countries.findAll();
  }

  @Get(':iso2')
  @ApiOperation({ summary: 'Get one active country by ISO 3166-1 alpha-2 code (e.g. AE)' })
  findByCode(@Param('iso2') iso2: string) {
    return this.countries.findByCode(iso2);
  }
}
