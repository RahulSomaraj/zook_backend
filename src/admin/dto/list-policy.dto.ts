import { ApiPropertyOptional } from '@nestjs/swagger';
import { PolicyType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Optional filters for GET /admin/policies. */
export class ListPolicyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PolicyType,
    description: 'Filter by document type.',
  })
  @IsOptional()
  @IsEnum(PolicyType)
  type?: PolicyType;

  @ApiPropertyOptional({ description: 'Filter by active flag.' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Include soft-deleted (archived) policies.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDeleted = false;
}
