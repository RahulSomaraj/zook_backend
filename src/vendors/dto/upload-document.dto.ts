import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const DOCUMENT_KINDS = [
  'trade_license',
  'emirates_id_front',
  'emirates_id_back',
] as const;

export class UploadDocumentQueryDto {
  @ApiProperty({ enum: DOCUMENT_KINDS })
  @IsIn(DOCUMENT_KINDS)
  kind!: (typeof DOCUMENT_KINDS)[number];
}
