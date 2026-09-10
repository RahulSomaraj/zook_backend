import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

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

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.prepaid,
    description:
      'How the order is settled. `cod` allocates a collection amount to each parcel; `prepaid` orders ship only after the payment is verified server-side.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
