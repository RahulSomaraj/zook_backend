import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectProductDto {
  @ApiProperty({ example: 'Inspection photos do not match the catalog model.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
