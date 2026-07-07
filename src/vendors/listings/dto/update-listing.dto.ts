import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateListingDto } from './create-listing.dto';

export class UpdateListingDto extends PartialType(CreateListingDto) {
  @ApiPropertyOptional({ description: 'Pause (false) or unpause (true) the listing' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}