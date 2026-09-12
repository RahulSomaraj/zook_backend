import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { JeeblyService } from '../../integrations/jeebly/jeebly.service';
import { OrdersService } from './orders.service';

const prismaMock = { subOrder: { findFirst: jest.fn() } };
const jeeblyMock = { trackShipment: jest.fn() };

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';
const SUB_ORDER_ID = '33333333-3333-3333-3333-333333333333';

describe('OrdersService (customer tracking)', () => {
  let service: OrdersService;
  const booked = {
    id: SUB_ORDER_ID,
    subOrderNumber: 'SUB-041',
    status: OrderStatus.shipped,
    courierName: 'Jeebly',
    awbNumber: 'JB304362',
  };
  const tracking = {
    awbNumber: 'JB304362',
    customerReference: 'SUB-041',
    lastStatus: 'inscan_at_hub',
    pickupDate: '2026-09-11',
    bookingDate: '2026-09-11',
    bookingTime: '06:46',
    events: [
      {
        status: 'inscan_at_hub',
        label: 'Inscan At Hub',
        description: 'Consignment has been inscanned at hub',
        hubName: 'Jeebly Warehouse',
        occurredAt: '2026-09-11T08:00:00.000Z',
        riderName: null,
        failureReason: null,
        proofOfDeliveryUrl: null,
        signatureUrl: null,
      },
    ],
  };
  const call = () =>
    service
      .getSubOrderTracking(USER_ID, ORDER_ID, SUB_ORDER_ID)
      .catch((caught: unknown) => caught);

  beforeEach(() => {
    jest.resetAllMocks();
    service = new OrdersService(
      prismaMock as unknown as PrismaService,
      new ConfigService({}),
      jeeblyMock as unknown as JeeblyService,
    );
    prismaMock.subOrder.findFirst.mockResolvedValue(booked);
    jeeblyMock.trackShipment.mockResolvedValue(tracking);
  });

  it("scopes the lookup to the customer's own order and returns live tracking", async () => {
    await expect(
      service.getSubOrderTracking(USER_ID, ORDER_ID, SUB_ORDER_ID),
    ).resolves.toEqual({
      subOrderId: SUB_ORDER_ID,
      subOrderNumber: 'SUB-041',
      status: OrderStatus.shipped,
      courierName: 'Jeebly',
      awbNumber: 'JB304362',
      lastStatus: 'inscan_at_hub',
      pickupDate: '2026-09-11',
      bookingDate: '2026-09-11',
      bookingTime: '06:46',
      events: tracking.events,
    });
    expect(prismaMock.subOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: SUB_ORDER_ID,
          orderId: ORDER_ID,
          order: { customerId: USER_ID },
        },
      }),
    );
    expect(jeeblyMock.trackShipment).toHaveBeenCalledWith('JB304362');
  });

  it("returns 404 when the item is not in the customer's order", async () => {
    prismaMock.subOrder.findFirst.mockResolvedValue(null);
    const error = await call();
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
    expect(jeeblyMock.trackShipment).not.toHaveBeenCalled();
  });

  it('returns 409 before the item is handed to the courier', async () => {
    prismaMock.subOrder.findFirst.mockResolvedValue({
      ...booked,
      status: OrderStatus.preparing,
      awbNumber: null,
    });
    const error = await call();
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'SHIPMENT_NOT_CREATED',
    });
    expect(jeeblyMock.trackShipment).not.toHaveBeenCalled();
  });

  it('propagates provider failures unchanged', async () => {
    jeeblyMock.trackShipment.mockRejectedValue(
      new BadGatewayException({ code: 'JEEBLY_UNKNOWN_SHIPMENT' }),
    );
    expect(await call()).toBeInstanceOf(BadGatewayException);
  });
});
