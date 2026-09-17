import { createHash } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

interface ParsedEvent {
  awbNumber: string;
  status: string;
  normalizedStatus: string;
  occurredAt: Date;
  description: string | null;
  hubName: string | null;
  failureReason: string | null;
  eventKey: string;
}

@Injectable()
export class JeeblyWebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async receive(payload: Record<string, unknown>) {
    const event = this.parse(payload);

    // Serializable transactions make the latest-event check and order update
    // safe when two webhook requests for the same AWB arrive simultaneously.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const subOrder = await tx.subOrder.findFirst({
              where: { awbNumber: event.awbNumber },
              select: { id: true, status: true },
            });
            if (!subOrder) {
              throw new NotFoundException({
                code: 'SHIPMENT_NOT_FOUND',
                message: `No sub-order found for AWB ${event.awbNumber}`,
              });
            }

            const latest = await tx.shipmentEvent.findFirst({
              where: { subOrderId: subOrder.id },
              orderBy: [{ occurredAt: 'desc' }, { eventKey: 'desc' }],
              select: { occurredAt: true },
            });
            const inserted = await tx.shipmentEvent.createMany({
              data: [
                {
                  subOrderId: subOrder.id,
                  eventKey: event.eventKey,
                  awbNumber: event.awbNumber,
                  status: event.status,
                  description: event.description,
                  hubName: event.hubName,
                  failureReason: event.failureReason,
                  occurredAt: event.occurredAt,
                },
              ],
              skipDuplicates: true,
            });
            if (inserted.count === 0) {
              return { received: true, duplicate: true, statusUpdated: false };
            }

            // Keep older (or equally timed) events in the ledger, but do not
            // let them change the current order state.
            if (latest && event.occurredAt <= latest.occurredAt) {
              return {
                received: true,
                duplicate: false,
                stale: true,
                statusUpdated: false,
              };
            }

            const nextStatus = this.mapOrderStatus(
              event.normalizedStatus,
              subOrder.status,
            );
            if (!nextStatus || nextStatus === subOrder.status) {
              return { received: true, duplicate: false, statusUpdated: false };
            }

            await tx.subOrder.update({
              where: { id: subOrder.id },
              data: {
                status: nextStatus,
                ...(nextStatus === OrderStatus.delivered
                  ? { deliveredAt: event.occurredAt }
                  : {}),
                ...(nextStatus === OrderStatus.cancelled
                  ? { cancelledAt: event.occurredAt }
                  : {}),
              },
            });
            await tx.subOrderStatusHistory.create({
              data: {
                subOrderId: subOrder.id,
                status: nextStatus,
                note: `Jeebly webhook: ${event.status}`,
              },
            });
            return {
              received: true,
              duplicate: false,
              statusUpdated: true,
              orderStatus: nextStatus,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (this.isSerializationFailure(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error('Jeebly webhook transaction retries exhausted');
  }

  private mapOrderStatus(
    providerStatus: string,
    current: OrderStatus,
  ): OrderStatus | null {
    if (current === OrderStatus.cancelled || current === OrderStatus.delivered)
      return null;

    if (providerStatus === 'cancelled') return OrderStatus.cancelled;
    if (providerStatus === 'delivered') return OrderStatus.delivered;
    if (
      current === OrderStatus.ready &&
      [
        'pickup completed',
        'inscan at hub',
        'reached at hub',
        'out for delivery',
        'undelivered',
        'on hold',
        'rescheduled',
        'rto',
      ].includes(providerStatus)
    ) {
      return OrderStatus.shipped;
    }
    // Pickup Scheduled / Not Picked Up stay "ready". RTO Delivered is a
    // return to the sender, not a delivery to the buyer.
    return null;
  }

  private parse(payload: Record<string, unknown>): ParsedEvent {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Expected a JSON object');
    }
    const awbNumber = this.requiredString(payload.reference_no, 'reference_no');
    const status = this.requiredString(payload.status, 'status');
    const timestamp = this.requiredString(
      payload.event_date_time,
      'event_date_time',
    );
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp)) {
      throw new BadRequestException(
        'event_date_time must be an ISO 8601 UTC timestamp',
      );
    }
    const occurredAt = new Date(timestamp);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('event_date_time is invalid');
    }
    const description = this.optionalString(payload.desc, 'desc');
    const hubName = this.optionalString(payload.hub_name, 'hub_name');
    const failureReason = this.optionalString(
      payload.failure_reason,
      'failure_reason',
    );
    const normalizedStatus = status
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const eventKey = createHash('sha256')
      .update(
        JSON.stringify([
          awbNumber,
          normalizedStatus,
          occurredAt.toISOString(),
          description,
          hubName,
          failureReason,
        ]),
      )
      .digest('hex');

    return {
      awbNumber,
      status,
      normalizedStatus,
      occurredAt,
      description,
      hubName,
      failureReason,
      eventKey,
    };
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) {
      throw new BadRequestException(
        `${field} must be a non-empty string of at most 200 characters`,
      );
    }
    return value.trim();
  }

  private optionalString(value: unknown, field: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > 1000) {
      throw new BadRequestException(
        `${field} must be a string of at most 1000 characters`,
      );
    }
    return value;
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }
}
