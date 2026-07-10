import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ enum: ['en', 'ar'], description: 'Vendor app display language' })
  @IsOptional()
  @IsIn(['en', 'ar'])
  language?: string;

  @ApiPropertyOptional({ enum: ['AED'], description: 'Display currency' })
  @IsOptional()
  @IsIn(['AED'])
  currency?: string;
}