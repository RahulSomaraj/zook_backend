import { ApiPropertyOptional } from '@nestjs/swagger';
import { KycStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListKycQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: KycStatus,
    description: 'Filter by KYC status. Defaults to pending.',
    default: KycStatus.pending,
  })
  @IsOptional()
  @IsEnum(KycStatus)
  status?: KycStatus;
}
