import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CheckoutDto {
  @ApiPropertyOptional({
    description: 'Selected customer address id. Stored as a reference for now.',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description: 'Selected payment method id. Stored as a reference for now.',
  })
  @IsOptional()
  @IsUUID()
  paymentId?: string;
}
