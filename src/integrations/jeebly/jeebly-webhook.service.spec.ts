import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JeeblyWebhookService } from './jeebly-webhook.service';

describe('JeeblyWebhookService', () => {
  const awbNumber = 'JB100625';
  const subOrderId = '22222222-2222-2222-2222-222222222222';
  const events: Array<{ eventKey: string; occurredAt: Date }> = [];
  let currentStatus: OrderStatus;
  const tx = {
    subOrder: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    shipmentEvent: {
      findFirst: jest.fn(),
      createMany: jest.fn(),
    },
    subOrderStatusHistory: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const service = new JeeblyWebhookService(prisma as unknown as PrismaService);

  const payload = (
    status: string,
    event_date_time = '2026-09-16T10:00:00Z',
  ) => ({
    reference_no: awbNumber,
    status,
    event_date_time,
    desc: 'Shipment status changed',
    recipient_phone: '+971501234567', // Other Jeebly fields are accepted but not stored.
  });

  beforeEach(() => {
    jest.clearAllMocks();
    events.length = 0;
    currentStatus = OrderStatus.ready;
    tx.subOrder.findFirst.mockImplementation(async () => ({
      id: subOrderId,
      status: currentStatus,
    }));
    tx.shipmentEvent.findFirst.mockImplementation(async () => {
      const sorted = [...events].sort(
        (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
      );
      return sorted[0] ?? null;
    });
    tx.shipmentEvent.createMany.mockImplementation(
      async ({
        data,
      }: {
        data: Array<{ eventKey: string; occurredAt: Date }>;
      }) => {
        if (events.some((event) => event.eventKey === data[0].eventKey))
          return { count: 0 };
        events.push({
          eventKey: data[0].eventKey,
          occurredAt: data[0].occurredAt,
        });
        return { count: 1 };
      },
    );
    tx.subOrder.update.mockImplementation(
      async ({ data }: { data: { status: OrderStatus } }) => {
        currentStatus = data.status;
        return { status: currentStatus };
      },
    );
  });

  it('marks a Delivered shipment delivered and writes one history row', async () => {
    await expect(service.receive(payload('Delivered'))).resolves.toMatchObject({
      received: true,
      statusUpdated: true,
      orderStatus: OrderStatus.delivered,
    });
    expect(tx.subOrder.findFirst).toHaveBeenCalledWith({
      where: { awbNumber },
      select: { id: true, status: true },
    });
    expect(tx.subOrder.update).toHaveBeenCalledWith({
      where: { id: subOrderId },
      data: {
        status: OrderStatus.delivered,
        deliveredAt: new Date('2026-09-16T10:00:00Z'),
      },
    });
    expect(tx.subOrderStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('maps Out For Delivery to shipped', async () => {
    await expect(
      service.receive(payload('Out For Delivery')),
    ).resolves.toMatchObject({
      statusUpdated: true,
      orderStatus: OrderStatus.shipped,
    });
    expect(currentStatus).toBe(OrderStatus.shipped);
  });

  it('returns a clear 404 for an unknown AWB', async () => {
    tx.subOrder.findFirst.mockResolvedValueOnce(null);
    await expect(service.receive(payload('Delivered'))).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.shipmentEvent.createMany).not.toHaveBeenCalled();
  });

  it('acknowledges duplicate events without a second status change', async () => {
    await service.receive(payload('Delivered'));
    await expect(service.receive(payload('Delivered'))).resolves.toEqual({
      received: true,
      duplicate: true,
      statusUpdated: false,
    });
    expect(events).toHaveLength(1);
    expect(tx.subOrderStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('stores an older event without rolling back the current status', async () => {
    await service.receive(payload('Delivered', '2026-09-16T10:00:00Z'));
    await expect(
      service.receive(payload('Out For Delivery', '2026-09-16T09:00:00Z')),
    ).resolves.toMatchObject({
      stale: true,
      statusUpdated: false,
    });
    expect(events).toHaveLength(2);
    expect(currentStatus).toBe(OrderStatus.delivered);
    expect(tx.subOrderStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('does not treat RTO Delivered as delivered to the buyer', async () => {
    await expect(
      service.receive(payload('RTO Delivered')),
    ).resolves.toMatchObject({ statusUpdated: false });
    expect(currentStatus).toBe(OrderStatus.ready);
  });

  it('rejects an invalid UTC timestamp', async () => {
    await expect(
      service.receive(payload('Delivered', 'not-a-date')),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
