import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** Which of the two required packing photos is being attached. */
export type PackPhotoType = 'before' | 'after';

/**
 * Attach a packing photo to a sub-order. The client first uploads the image via
 * `POST /storage/uploads/sign` (bucket `packing-photos`), then sends the
 * returned storage `key` here as `objectKey`. The server records it and runs
 * the fraud/content check.
 */
export class AttachPackPhotoDto {
  @ApiProperty({
    enum: ['before', 'after'],
    description: 'Which packing photo this is: before or after packing.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['before', 'after'])
  type!: PackPhotoType;

  @ApiProperty({
    description: 'Storage object key returned by the signed-upload endpoint.',
    example: '9f0f8349-.../before-packing-1783697149762.jpg',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(500)
  objectKey!: string;
}
