import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectKycDto {
  @ApiProperty({ example: 'Trade license is expired.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
