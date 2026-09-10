import {
  BadGatewayException,
  ConflictException,
  GatewayTimeoutException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { VendorOrdersService } from './vendor-orders.service';
import { JeeblyService } from '../../integrations/jeebly/jeebly.service';
import { ShipmentDataService } from './shipment-data.service';

const jeeblyMock = { createShipment: jest.fn(), assertConfigured: jest.fn() };
const shipmentDataMock = { buildPayload: jest.fn() };

const prismaMock = {
  vendor: {
    findUnique: jest.fn(),
  },
  subOrder: {
    findFirst: jest.fn(),
  },
  shipmentCreation: { create: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
};

const transactionMock = {
  subOrder: {
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  subOrderStatusHistory: {
    create: jest.fn(),
  },
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const VENDOR_ID = '22222222-2222-2222-2222-222222222222';
const SUB_ORDER_ID = '33333333-3333-3333-3333-333333333333';

const updatedRow = {
  id: SUB_ORDER_ID,
  subOrderNumber: 'SUB-041',
  status: OrderStatus.preparing,
  salePrice: new Prisma.Decimal('1200.00'),
  payoutAmount: new Prisma.Decimal('1015.20'),
  payoutStatus: PayoutStatus.pending,
  courierName: null,
  awbNumber: null,
  createdAt: new Date('2026-07-01T10:00:00.000Z'),
  deliveredAt: null,
  product: {
    id: '44444444-4444-4444-4444-444444444444',
    conditionGrade: 'like_new',
    storageVariant: '256GB',
    color: 'Black',
    inspectionImages: ['products/iphone.png'],
    catalog: {
      model: 'iPhone 14 Pro',
      stockImageUrl: null,
      brand: {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Apple',
        logoUrl: null,
      },
    },
  },
};

describe('VendorOrdersService', () => {
  let service: VendorOrdersService;

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID });
    prismaMock.$transaction.mockImplementation(
      (callback: (tx: typeof transactionMock) => unknown) =>
        callback(transactionMock),
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VendorOrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JeeblyService, useValue: jeeblyMock },
        { provide: ShipmentDataService, useValue: shipmentDataMock },
      ],
    }).compile();
    service = moduleRef.get(VendorOrdersService);
  });

  describe('readyForPickup', () => {
    const prepared = {
      ...updatedRow,
      vendorId: VENDOR_ID,
      packPhotoBeforeUrl: 'before.jpg',
      packPhotoAfterUrl: 'after.jpg',
      shipmentCreation: null,
    };
    const payload = { customer_reference_number: 'SUB-041' };
    const ready = {
      ...prepared,
      status: OrderStatus.ready,
      courierName: 'Jeebly',
      awbNumber: 'JB304362',
    };

    beforeEach(() => {
      prismaMock.subOrder.findFirst.mockResolvedValue(prepared);
      shipmentDataMock.buildPayload.mockReturnValue(payload);
      prismaMock.shipmentCreation.create.mockResolvedValue({
        subOrderId: SUB_ORDER_ID,
      });
      prismaMock.shipmentCreation.update.mockResolvedValue({
        awbNumber: 'JB304362',
      });
      jeeblyMock.createShipment.mockResolvedValue({
        awbNumber: 'JB304362',
        message: 'Created Successfully.',
      });
      transactionMock.subOrder.updateMany.mockResolvedValue({ count: 1 });
      transactionMock.subOrder.findUniqueOrThrow.mockResolvedValue(ready);
    });

    it('creates Jeebly shipment outside the transaction, saves AWB/courier/ready and history', async () => {
      jeeblyMock.createShipment.mockImplementation(() => {
        expect(prismaMock.shipmentCreation.create).toHaveBeenCalledTimes(1);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        return Promise.resolve({ awbNumber: 'JB304362' });
      });
      const result = await service.readyForPickup(USER_ID, SUB_ORDER_ID);
      expect(prismaMock.subOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SUB_ORDER_ID, vendorId: VENDOR_ID },
        }),
      );
      expect(jeeblyMock.createShipment).toHaveBeenCalledWith(payload);
      expect(prismaMock.shipmentCreation.update).toHaveBeenCalledWith({
        where: { subOrderId: SUB_ORDER_ID },
        data: { awbNumber: 'JB304362' },
      });
      expect(transactionMock.subOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vendorId: VENDOR_ID,
            status: OrderStatus.preparing,
            awbNumber: null,
          }) as unknown,
          data: {
            status: OrderStatus.ready,
            courierName: 'Jeebly',
            awbNumber: 'JB304362',
          },
        }),
      );
      expect(transactionMock.subOrderStatusHistory.create).toHaveBeenCalledWith(
        {
          data: {
            subOrderId: SUB_ORDER_ID,
            status: OrderStatus.ready,
            actorId: USER_ID,
            note: 'Marked ready for pickup. Jeebly AWB: JB304362',
          },
        },
      );
      expect(result).toEqual(ready);
    });

    it('rejects another vendor’s sub-order', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue(null);
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(jeeblyMock.createShipment).not.toHaveBeenCalled();
    });

    it.each(['packPhotoBeforeUrl', 'packPhotoAfterUrl'])(
      'requires %s',
      async (field) => {
        prismaMock.subOrder.findFirst.mockResolvedValue({
          ...prepared,
          [field]: null,
        });
        await expect(
          service.readyForPickup(USER_ID, SUB_ORDER_ID),
        ).rejects.toThrow('Upload both packing photos');
        expect(prismaMock.shipmentCreation.create).not.toHaveBeenCalled();
        expect(jeeblyMock.createShipment).not.toHaveBeenCalled();
      },
    );

    it.each([
      OrderStatus.confirmed,
      OrderStatus.ready,
      OrderStatus.shipped,
      OrderStatus.delivered,
      OrderStatus.cancelled,
    ])('rejects status %s', async (status) => {
      prismaMock.subOrder.findFirst.mockResolvedValue({ ...prepared, status });
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(jeeblyMock.createShipment).not.toHaveBeenCalled();
    });

    it('rejects an existing AWB, including after status becomes ready', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue(ready);
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toThrow('Shipment has already been created for this sub-order');
      expect(jeeblyMock.createShipment).not.toHaveBeenCalled();
    });

    it('does not claim or send when authoritative shipment data is missing', async () => {
      shipmentDataMock.buildPayload.mockImplementation(() => {
        throw new UnprocessableEntityException('SHIPMENT_DATA_MISSING');
      });
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prismaMock.shipmentCreation.create).not.toHaveBeenCalled();
      expect(jeeblyMock.createShipment).not.toHaveBeenCalled();
    });

    it('does not claim when Jeebly configuration is missing', async () => {
      jeeblyMock.assertConfigured.mockImplementation(() => {
        throw new ServiceUnavailableException();
      });
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prismaMock.shipmentCreation.create).not.toHaveBeenCalled();
    });

    it.each([
      new BadGatewayException('Jeebly rejected'),
      new GatewayTimeoutException('Timeout'),
    ])(
      'keeps order preparing and claim retained on provider failure: %s',
      async (error) => {
        jeeblyMock.createShipment.mockRejectedValue(error);
        await expect(
          service.readyForPickup(USER_ID, SUB_ORDER_ID),
        ).rejects.toBe(error);
        expect(prismaMock.shipmentCreation.update).not.toHaveBeenCalled();
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        expect(
          transactionMock.subOrderStatusHistory.create,
        ).not.toHaveBeenCalled();
      },
    );

    it('blocks a retained claim after a restart or uncertain outcome', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue({
        ...prepared,
        shipmentCreation: { awbNumber: null },
      });
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(jeeblyMock.createShipment).not.toHaveBeenCalled();
    });

    it('allows only one concurrent request to call Jeebly', async () => {
      let claimed = false;
      prismaMock.shipmentCreation.create.mockImplementation(() => {
        if (claimed)
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('duplicate', {
              code: 'P2002',
              clientVersion: '6',
            }),
          );
        claimed = true;
        return Promise.resolve({ subOrderId: SUB_ORDER_ID });
      });
      const results = await Promise.allSettled([
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(jeeblyMock.createShipment).toHaveBeenCalledTimes(1);
      expect(
        transactionMock.subOrderStatusHistory.create,
      ).toHaveBeenCalledTimes(1);
    });

    it('does not call Jeebly when claim storage fails', async () => {
      prismaMock.shipmentCreation.create.mockRejectedValue(
        new Error('database unavailable'),
      );
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(jeeblyMock.createShipment).not.toHaveBeenCalled();
    });

    it('recovers a failed local transaction using the stored AWB without another provider call', async () => {
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      prismaMock.$transaction.mockRejectedValueOnce(
        new Error('database failure'),
      );
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      prismaMock.subOrder.findFirst.mockResolvedValue({
        ...prepared,
        shipmentCreation: { awbNumber: 'JB304362' },
      });
      expect(await service.readyForPickup(USER_ID, SUB_ORDER_ID)).toEqual(
        ready,
      );
      expect(jeeblyMock.createShipment).toHaveBeenCalledTimes(1);
      expect(prismaMock.shipmentCreation.create).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });

    it('logs only reconciliation identifiers if storing the returned AWB fails', async () => {
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      prismaMock.shipmentCreation.update.mockRejectedValue(
        new Error('secret database error'),
      );
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(log).toHaveBeenCalledWith(
        JSON.stringify({
          code: 'JEEBLY_AWB_PERSIST_FAILED',
          subOrderNumber: 'SUB-041',
          customer_reference_number: 'SUB-041',
          awbNumber: 'JB304362',
        }),
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      prismaMock.subOrder.findFirst.mockResolvedValue({
        ...prepared,
        shipmentCreation: { awbNumber: null },
      });
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(jeeblyMock.createShipment).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });

    it('does not append history when the final conditional transition loses a race', async () => {
      transactionMock.subOrder.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.readyForPickup(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        transactionMock.subOrderStatusHistory.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe('startPacking', () => {
    it('atomically moves an owned confirmed sub-order to preparing', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue({
        status: OrderStatus.confirmed,
      });
      transactionMock.subOrder.updateMany.mockResolvedValue({ count: 1 });
      transactionMock.subOrderStatusHistory.create.mockResolvedValue({});
      transactionMock.subOrder.findUniqueOrThrow.mockResolvedValue(updatedRow);

      const result = await service.startPacking(USER_ID, SUB_ORDER_ID);

      expect(prismaMock.subOrder.findFirst).toHaveBeenCalledWith({
        where: { id: SUB_ORDER_ID, vendorId: VENDOR_ID },
        select: { status: true },
      });
      expect(transactionMock.subOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: SUB_ORDER_ID,
          vendorId: VENDOR_ID,
          status: OrderStatus.confirmed,
        },
        data: { status: OrderStatus.preparing },
      });
      expect(transactionMock.subOrderStatusHistory.create).toHaveBeenCalledWith(
        {
          data: {
            subOrderId: SUB_ORDER_ID,
            status: OrderStatus.preparing,
            actorId: USER_ID,
            note: 'Vendor started packing',
          },
        },
      );
      expect(result.status).toBe(OrderStatus.preparing);
      expect(result.item.title).toBe('Apple iPhone 14 Pro');
    });

    it('returns 404 when the sub-order does not belong to the vendor', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.startPacking(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('returns 409 when the sub-order is not confirmed', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue({
        status: OrderStatus.preparing,
      });

      await expect(
        service.startPacking(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('returns 409 when a concurrent request wins the transition', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue({
        status: OrderStatus.confirmed,
      });
      transactionMock.subOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.startPacking(USER_ID, SUB_ORDER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        transactionMock.subOrderStatusHistory.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordPackageWeight', () => {
    const packing = {
      subOrderNumber: 'SUB-041',
      status: OrderStatus.preparing,
      awbNumber: null,
      packPhotoBeforeUrl: 'before.jpg',
      packPhotoAfterUrl: 'after.jpg',
      photosVerifiedAt: new Date('2026-07-01T10:00:00.000Z'),
      packageWeightKg: null,
      shipmentCreation: null,
    };

    beforeEach(() => {
      prismaMock.subOrder.findFirst.mockResolvedValue(packing);
      transactionMock.subOrder.updateMany.mockResolvedValue({ count: 1 });
      transactionMock.subOrder.findUniqueOrThrow.mockResolvedValue({
        ...packing,
        packageWeightKg: new Prisma.Decimal('0.450'),
      });
    });

    it('stores the measured weight, logs it and unlocks ready-for-pickup', async () => {
      const result = await service.recordPackageWeight(USER_ID, SUB_ORDER_ID, {
        weightKg: 0.45,
      });

      expect(transactionMock.subOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: SUB_ORDER_ID,
          vendorId: VENDOR_ID,
          status: OrderStatus.preparing,
          awbNumber: null,
          shipmentCreation: { is: null },
        },
        data: { packageWeightKg: new Prisma.Decimal('0.450') },
      });
      expect(transactionMock.subOrderStatusHistory.create).toHaveBeenCalledWith(
        {
          data: {
            subOrderId: SUB_ORDER_ID,
            status: OrderStatus.preparing,
            actorId: USER_ID,
            note: 'Package weight recorded: 0.450 kg',
          },
        },
      );
      expect(result).toMatchObject({
        packageWeightKg: 0.45,
        nextAction: 'ready_for_pickup',
      });
    });

    it('asks for the weight before ready-for-pickup while it is unset', async () => {
      transactionMock.subOrder.findUniqueOrThrow.mockResolvedValue(packing);

      const result = await service.recordPackageWeight(USER_ID, SUB_ORDER_ID, {
        weightKg: 0.45,
      });

      expect(result).toMatchObject({
        packageWeightKg: null,
        nextAction: 'record_weight',
      });
    });

    it('refuses to change the weight once a shipment attempt is claimed', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue({
        ...packing,
        shipmentCreation: { awbNumber: null },
      });

      await expect(
        service.recordPackageWeight(USER_ID, SUB_ORDER_ID, { weightKg: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to change the weight once an AWB exists', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue({
        ...packing,
        awbNumber: 'JB304362',
      });

      await expect(
        service.recordPackageWeight(USER_ID, SUB_ORDER_ID, { weightKg: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.confirmed, OrderStatus.ready])(
      'rejects recording a weight while the order is %s',
      async (status) => {
        prismaMock.subOrder.findFirst.mockResolvedValue({ ...packing, status });

        await expect(
          service.recordPackageWeight(USER_ID, SUB_ORDER_ID, { weightKg: 1 }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
      },
    );

    it('rejects another vendor’s sub-order', async () => {
      prismaMock.subOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.recordPackageWeight(USER_ID, SUB_ORDER_ID, { weightKg: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('does not append history when a claim wins the race mid-transaction', async () => {
      transactionMock.subOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.recordPackageWeight(USER_ID, SUB_ORDER_ID, { weightKg: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        transactionMock.subOrderStatusHistory.create,
      ).not.toHaveBeenCalled();
    });
  });
});
