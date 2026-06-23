import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_STORAGE_BUCKET, StorageBucket } from '../storage-bucket.enum';

export class PresignDownloadDto {
  @ApiPropertyOptional({
    enum: StorageBucket,
    description: 'Bucket the object lives in. Defaults to `zook_data`.',
    default: DEFAULT_STORAGE_BUCKET,
  })
  @IsOptional()
  @IsEnum(StorageBucket)
  bucket: StorageBucket = DEFAULT_STORAGE_BUCKET;

  @ApiProperty({
    description: 'Object key returned when the file was uploaded.',
    example: 'vendor_123/0f9a...-trade-license.pdf',
  })
  @IsString()
  key!: string;

  @ApiPropertyOptional({
    description: 'Seconds the URL stays valid (60–604800). Defaults to 3600.',
    minimum: 60,
    maximum: 604800,
    default: 3600,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(604800)
  expiresIn?: number;
}
