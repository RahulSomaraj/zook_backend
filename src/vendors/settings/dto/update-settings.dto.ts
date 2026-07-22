import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'], description: 'Vendor app display language' })
  @IsOptional()
  @IsIn(['en', 'ar'])
  language?: string;

  @ApiPropertyOptional({
    description: 'Country id (from GET /countries). Determines the store currency.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  countryId?: string;
}
