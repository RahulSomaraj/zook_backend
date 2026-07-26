import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { VendorOrdersService } from './vendor-orders.service';

const prismaMock = {
  vendor: {
    findUnique: jest.fn(),
  },
  subOrder: {
    findFirst: jest.fn(),
  },
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
    jest.clearAllMocks();
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_ID });
    prismaMock.$transaction.mockImplementation(
      (callback: (tx: typeof transactionMock) => unknown) =>
        callback(transactionMock),
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VendorOrdersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(VendorOrdersService);
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
});
