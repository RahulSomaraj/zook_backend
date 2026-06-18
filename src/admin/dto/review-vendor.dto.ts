import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectVendorDto {
  @ApiProperty({ description: 'Reason shown to the vendor on rejection' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class SuspendVendorDto {
  @ApiPropertyOptional({ description: 'Optional internal note / reason' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
