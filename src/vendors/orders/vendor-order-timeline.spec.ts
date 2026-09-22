import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderStatus, PayoutStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { PrismaService } from '../../database/prisma.service';
import { JeeblyService } from '../../integrations/jeebly/jeebly.service';
import { ShipmentDataService } from './shipment-data.service';
import { VendorOrdersController } from './vendor-orders.controller';
import { VendorOrdersService } from './vendor-orders.service';

describe('Vendor order timeline API', () => {
  let app: INestApplication;
  const id = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const vendorId = '33333333-3333-4333-8333-333333333333';
  const path = `/api/vendors/me/orders/${id}/timeline`;
  const detailsPath = `/api/vendors/me/orders/${id}/details`;
  const findVendor = jest.fn();
  const findOrder = jest.fn();
  const trackShipment = jest.fn();
  const createdAt = new Date('2026-06-07T06:22:00Z');
  const photosVerifiedAt = new Date('2026-06-07T07:04:00Z');
  const pickedUpAt = new Date('2026-06-07T09:30:00Z');
  const deliveredAt = new Date('2026-06-07T13:18:00Z');
  const baseOrder = {
    id,
    subOrderNumber: 'SUB-041',
    status: OrderStatus.confirmed,
    createdAt,
    photosVerifiedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    courierName: null,
    payoutStatus: PayoutStatus.pending,
    payoutAmount: new Prisma.Decimal('739.75'),
    statusHistory: [],
    shipmentEvents: [],
  };
  const getTimeline = () =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer vendor');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VendorOrdersController],
      providers: [
        VendorOrdersService,
        {
          provide: PrismaService,
          useValue: {
            vendor: { findUnique: findVendor },
            subOrder: { findFirst: findOrder },
          },
        },
        { provide: JeeblyService, useValue: { trackShipment } },
        { provide: ShipmentDataService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = {
            id: userId,
            roles: [req.headers.authorization.replace('Bearer ', '')],
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    findVendor.mockResolvedValue({ id: vendorId });
    findOrder.mockResolvedValue(baseOrder);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns five ordered milestones before a shipment exists and scopes the query to the vendor', async () => {
    const { body, headers } = await getTimeline().expect(200);
    expect(body.success).toBe(true);
    expect(headers['cache-control']).toBe('private, no-store');
    expect(
      body.data.timeline.map((step) => [
        step.key,
        step.status,
        step.occurredAt,
      ]),
    ).toEqual([
      ['order_confirmed', 'completed', createdAt.toISOString()],
      ['photos_verified', 'pending', null],
      ['picked_up', 'pending', null],
      ['delivered', 'pending', null],
      ['payout_issued', 'pending', null],
    ]);
    expect(findVendor).toHaveBeenCalledWith({
      where: { userId },
      select: { id: true },
    });
    expect(findOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, vendorId },
        select: expect.objectContaining({
          statusHistory: expect.objectContaining({
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
          shipmentEvents: expect.objectContaining({
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          }),
        }),
      }),
    );
    expect(trackShipment).not.toHaveBeenCalled();
  });

  it.each([PayoutStatus.issued, PayoutStatus.redeemed])(
    'renders the completed timeline for %s payouts without inventing email delivery',
    async (payoutStatus) => {
      findOrder.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.delivered,
        payoutStatus,
        photosVerifiedAt,
        deliveredAt,
        courierName: 'Porter.ae',
        statusHistory: [
          { status: OrderStatus.shipped, createdAt: deliveredAt },
        ],
        shipmentEvents: [
          { status: 'Pickup_Completed', occurredAt: pickedUpAt },
          { status: 'Pickup Completed', occurredAt: deliveredAt },
        ],
      });
      const { body } = await getTimeline().expect(200);
      expect(
        body.data.timeline.every((step) => step.status === 'completed'),
      ).toBe(true);
      expect(body.data.timeline[1].occurredAt).toBe(
        photosVerifiedAt.toISOString(),
      );
      expect(body.data.timeline[2]).toMatchObject({
        label: 'Picked up by Porter.ae',
        occurredAt: pickedUpAt.toISOString(),
      });
      expect(body.data.timeline[3]).toMatchObject({
        occurredAt: deliveredAt.toISOString(),
        description: 'Confirmed',
      });
      expect(body.data.timeline[4]).toMatchObject({
        label: 'Payout issued — AED 739.75',
        occurredAt: null,
        description: null,
      });
      expect(body.data.payout).toEqual({
        status: payoutStatus,
        amount: '739.75',
        currency: 'AED',
        issuedAt: null,
        emailRecipient: null,
        emailedAt: null,
      });
    },
  );

  it('keeps missing photo and pickup times null even when delivery is known', async () => {
    findOrder.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.delivered,
      deliveredAt,
    });
    const { body } = await getTimeline().expect(200);
    expect(body.data.timeline[1]).toMatchObject({
      status: 'pending',
      occurredAt: null,
    });
    expect(body.data.timeline[2]).toMatchObject({
      status: 'completed',
      occurredAt: null,
    });
    expect(body.data.timeline[4].status).toBe('pending');
  });

  it('does not present an in-transit history timestamp as the actual pickup time', async () => {
    findOrder.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.shipped,
      statusHistory: [{ status: OrderStatus.shipped, createdAt: pickedUpAt }],
    });
    const { body } = await getTimeline().expect(200);
    expect(body.data.timeline[2]).toMatchObject({
      status: 'completed',
      occurredAt: null,
    });
  });

  it('uses stored delivery event time before history receipt time', async () => {
    findOrder.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.delivered,
      shipmentEvents: [{ status: 'Delivered', occurredAt: deliveredAt }],
      statusHistory: [
        {
          status: OrderStatus.delivered,
          createdAt: new Date('2026-06-08T00:00:00Z'),
        },
      ],
    });
    const { body } = await getTimeline().expect(200);
    expect(body.data.timeline[3].occurredAt).toBe(deliveredAt.toISOString());
  });

  it('falls back to delivery status history for legacy orders', async () => {
    findOrder.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.delivered,
      statusHistory: [
        { status: OrderStatus.delivered, createdAt: deliveredAt },
      ],
    });
    const { body } = await getTimeline().expect(200);
    expect(body.data.timeline[3].occurredAt).toBe(deliveredAt.toISOString());
  });

  it.each(['Pickup Scheduled', 'Not Picked Up', 'RTO Delivered'])(
    'does not confuse %s with pickup or buyer delivery',
    async (status) => {
      findOrder.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.ready,
        shipmentEvents: [{ status, occurredAt: pickedUpAt }],
      });
      const { body } = await getTimeline().expect(200);
      expect(body.data.timeline[2].status).toBe('pending');
      expect(body.data.timeline[3].status).toBe('pending');
    },
  );

  it('marks a held payout as blocked', async () => {
    findOrder.mockResolvedValue({
      ...baseOrder,
      payoutStatus: PayoutStatus.held,
    });
    const { body } = await getTimeline().expect(200);
    expect(body.data.timeline[4]).toMatchObject({
      status: 'blocked',
      label: 'Payout on hold — AED 739.75',
    });
  });

  it('preserves completed steps and skips unfinished steps on cancellation', async () => {
    findOrder.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.cancelled,
      photosVerifiedAt,
      cancelledAt: pickedUpAt,
    });
    const { body } = await getTimeline().expect(200);
    expect(body.data.timeline.map((step) => step.status)).toEqual([
      'completed',
      'completed',
      'skipped',
      'skipped',
      'skipped',
      'completed',
    ]);
    expect(body.data.timeline[5]).toMatchObject({
      key: 'order_cancelled',
      occurredAt: pickedUpAt.toISOString(),
    });
  });

  it('returns 404 for missing or other-vendor orders', async () => {
    findOrder.mockResolvedValue(null);
    await getTimeline().expect(404);
  });

  it('returns all stored order details with null live tracking before shipment booking', async () => {
    findOrder.mockResolvedValue({
      ...baseOrder,
      order: {
        orderNumber: 'ORD-041',
        paymentMethod: 'prepaid',
        paymentStatus: 'paid',
        estimatedDeliveryAt: deliveredAt,
      },
      product: {
        id: '44444444-4444-4444-8444-444444444444',
        conditionGrade: 'excellent',
        storageVariant: '256 GB',
        color: 'Black',
        inspectionImages: ['inspection/front.jpg'],
        catalog: {
          model: 'iPhone 15',
          stockImageUrl: 'catalog/iphone-15.jpg',
          brand: { id: 'brand-1', name: 'Apple', logoUrl: null },
        },
      },
      awbNumber: null,
      packPhotoBeforeUrl: 'packing/before.jpg',
      packPhotoAfterUrl: null,
      packageWeightKg: null,
      salePrice: new Prisma.Decimal('2100'),
      commissionRate: new Prisma.Decimal('10'),
      processingFee: new Prisma.Decimal('60.90'),
      payoutAmount: new Prisma.Decimal('1829.10'),
      statusHistory: [
        {
          status: OrderStatus.confirmed,
          note: 'Order created',
          createdAt,
        },
      ],
    });

    const { body, headers } = await request(app.getHttpServer())
      .get(detailsPath)
      .set('Authorization', 'Bearer vendor')
      .expect(200);

    expect(headers['cache-control']).toBe('private, no-store');
    expect(body.data).toMatchObject({
      id,
      subOrderNumber: 'SUB-041',
      order: { orderNumber: 'ORD-041' },
      item: { title: 'Apple iPhone 15' },
      packing: {
        uploaded: 1,
        complete: false,
        nextAction: 'upload_after',
      },
      shipment: {
        awbNumber: null,
        storedEvents: [],
        liveTracking: null,
      },
      payout: {
        salePrice: '2100.00',
        commissionRate: '10',
        commission: '210.00',
        processingFee: '60.90',
        payoutAmount: '1829.10',
        status: PayoutStatus.pending,
        currency: 'AED',
      },
    });
    expect(body.data.timeline).toHaveLength(5);
    expect(body.data.statusHistory).toHaveLength(1);
    expect(trackShipment).not.toHaveBeenCalled();
  });

  it('adds live courier tracking to the unified details response after booking', async () => {
    const tracking = {
      awbNumber: 'JB304362',
      customerReference: 'SUB-041',
      lastStatus: 'out_for_delivery',
      pickupDate: '2026-06-07',
      bookingDate: '2026-06-07',
      bookingTime: '09:00',
      events: [{ status: 'out_for_delivery', label: 'Out For Delivery' }],
    };
    findOrder.mockResolvedValue({
      ...baseOrder,
      order: {
        orderNumber: 'ORD-041',
        paymentMethod: 'prepaid',
        paymentStatus: 'paid',
        estimatedDeliveryAt: deliveredAt,
      },
      product: {
        id: '44444444-4444-4444-8444-444444444444',
        conditionGrade: 'excellent',
        storageVariant: null,
        color: null,
        inspectionImages: [],
        catalog: {
          model: 'iPhone 15',
          stockImageUrl: null,
          brand: { id: 'brand-1', name: 'Apple', logoUrl: null },
        },
      },
      courierName: 'Jeebly',
      awbNumber: 'JB304362',
      packPhotoBeforeUrl: 'packing/before.jpg',
      packPhotoAfterUrl: 'packing/after.jpg',
      packageWeightKg: new Prisma.Decimal('0.450'),
      salePrice: new Prisma.Decimal('1000'),
      commissionRate: new Prisma.Decimal('10'),
      processingFee: new Prisma.Decimal('29'),
      payoutAmount: new Prisma.Decimal('871'),
      shipmentEvents: [],
    });
    trackShipment.mockResolvedValue(tracking);

    const { body } = await request(app.getHttpServer())
      .get(detailsPath)
      .set('Authorization', 'Bearer vendor')
      .expect(200);

    expect(body.data.shipment.liveTracking).toEqual({
      lastStatus: 'out_for_delivery',
      pickupDate: '2026-06-07',
      bookingDate: '2026-06-07',
      bookingTime: '09:00',
      events: tracking.events,
    });
    expect(trackShipment).toHaveBeenCalledWith('JB304362');
  });

  it('returns 404 when the vendor profile is missing', async () => {
    findVendor.mockResolvedValue(null);
    await getTimeline().expect(404);
    expect(findOrder).not.toHaveBeenCalled();
  });

  it('rejects invalid UUIDs before querying', async () => {
    await request(app.getHttpServer())
      .get('/api/vendors/me/orders/invalid/timeline')
      .set('Authorization', 'Bearer vendor')
      .expect(400);
    expect(findVendor).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(findVendor).not.toHaveBeenCalled();
  });

  it.each(['customer', 'admin', 'inspector'])(
    'rejects the %s role',
    async (role) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${role}`)
        .expect(403);
      expect(findVendor).not.toHaveBeenCalled();
    },
  );
});
