import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/** Admin-creates a policy. `createdBy` is taken from the auth token, not the body. */
export class CreatePolicyDto {
  @ApiProperty({ description: 'The policy text.' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ description: 'Whether the policy is active.', default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}
