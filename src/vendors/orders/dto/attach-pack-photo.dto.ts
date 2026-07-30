import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trimKey = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Attach packing photos to a sub-order in a single call. The client first
 * uploads each image via `POST /storage/uploads/sign` (bucket `packing-photos`)
 * and sends the returned storage keys here. Provide `beforeKey`, `afterKey`, or
 * BOTH — at least one is required.
 */
export class AttachPackPhotoDto {
  @ApiPropertyOptional({
    description: 'Storage key of the BEFORE-packing photo.',
    example: '9f0f8349-.../before-packing.jpg',
  })
  @IsOptional()
  @IsString()
  @Transform(trimKey)
  @MinLength(1)
  @MaxLength(500)
  beforeKey?: string;

  @ApiPropertyOptional({
    description: 'Storage key of the AFTER-packing photo.',
    example: '9f0f8349-.../after-packing.jpg',
  })
  @IsOptional()
  @IsString()
  @Transform(trimKey)
  @MinLength(1)
  @MaxLength(500)
  afterKey?: string;
}
