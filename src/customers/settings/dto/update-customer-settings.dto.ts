import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateCustomerSettingsDto {
  @ApiPropertyOptional({
    enum: ['en', 'ar'],
    description: 'Customer app display language',
  })
  @IsOptional()
  @IsIn(['en', 'ar'])
  language?: string;
}
