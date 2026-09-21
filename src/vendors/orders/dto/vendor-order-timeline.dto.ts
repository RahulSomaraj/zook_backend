import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PayoutStatus } from '@prisma/client';

export class OrderTimelineStepDto {
  @ApiProperty({
    enum: [
      'order_confirmed',
      'photos_verified',
      'picked_up',
      'delivered',
      'payout_issued',
      'order_cancelled',
    ],
  })
  key: string;

  @ApiProperty({ example: 'Photos verified & packed' })
  label: string;

  @ApiProperty({ enum: ['completed', 'pending', 'blocked', 'skipped'] })
  status: 'completed' | 'pending' | 'blocked' | 'skipped';

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  occurredAt: Date | null;

  @ApiProperty({ type: String, nullable: true, example: 'Confirmed' })
  description: string | null;
}

export class OrderTimelinePayoutDto {
  @ApiProperty({ enum: PayoutStatus })
  status: PayoutStatus;

  @ApiProperty({
    example: '739.75',
    description: 'Stored payout, as a decimal string.',
  })
  amount: string;

  @ApiProperty({ example: 'AED' })
  currency: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Not currently recorded; null.',
  })
  issuedAt: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Actual VCC email recipient is not currently recorded; null.',
  })
  emailRecipient: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'VCC email delivery is not currently recorded; null.',
  })
  emailedAt: Date | null;
}

export class VendorOrderTimelineDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SUB-041' })
  subOrderNumber: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ type: String, nullable: true, example: 'Jeebly' })
  courierName: string | null;

  @ApiProperty({ type: [OrderTimelineStepDto] })
  timeline: OrderTimelineStepDto[];

  @ApiProperty({ type: OrderTimelinePayoutDto })
  payout: OrderTimelinePayoutDto;
}
