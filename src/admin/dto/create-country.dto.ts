import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Admin-creates a supported country and the currency shown to users in it. */
export class CreateCountryDto {
  @ApiProperty({ example: 'United Arab Emirates' })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 code.', example: 'AE' })
  @IsString()
  @Transform(upperTrim)
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'iso2 must be two uppercase letters' })
  iso2!: string;

  @ApiPropertyOptional({ description: 'International dialing code.', example: '+971' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(8)
  dialCode?: string;

  @ApiProperty({ description: 'ISO 4217 currency code.', example: 'AED' })
  @IsString()
  @Transform(upperTrim)
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currencyCode must be three uppercase letters' })
  currencyCode!: string;

  @ApiProperty({ example: 'UAE Dirham' })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(60)
  currencyName!: string;

  @ApiProperty({ example: 'د.إ' })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(8)
  currencySymbol!: string;

  @ApiPropertyOptional({
    description: 'Multiplier from the base currency (AED). localPrice = basePrice * exchangeRate.',
    default: 1,
    minimum: 0,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  exchangeRate?: number;

  @ApiPropertyOptional({ description: 'Fallback country when the user has not chosen one.', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Whether the country shows in the public list.', default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort order in the public list (asc).', default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
