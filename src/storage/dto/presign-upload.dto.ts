import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DEFAULT_STORAGE_BUCKET, StorageBucket } from '../storage-bucket.enum';

export class PresignUploadDto {
  @ApiPropertyOptional({
    enum: StorageBucket,
    description: 'Target storage bucket. Defaults to `zook_data`.',
    default: DEFAULT_STORAGE_BUCKET,
  })
  @IsOptional()
  @IsEnum(StorageBucket)
  bucket: StorageBucket = DEFAULT_STORAGE_BUCKET;

  @ApiProperty({ example: 'trade-license.pdf', description: 'Original file name.' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @ApiPropertyOptional({
    description: 'Optional sub-folder for namespacing, e.g. the vendor id.',
    example: 'vendor_123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  folder?: string;

  @ApiPropertyOptional({
    description: 'Overwrite an existing object at the same key.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  upsert?: boolean;
}
