import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AdminOrdersService } from './admin-orders.service';
import { ListOrdersQueryDto } from './dto/list-orders.dto';

const prismaMock = {
  subOrder: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const VENDOR_ID = '33333333-3333-3333-3333-333333333333';

const baseRow = {
  id: '11111111-1111-1111-1111-111111111111',
  subOrderNumber: 'SUB-041',
  orderId: '99999999-9999-9999-9999-999999999999',
  status: OrderStatus.confirmed,
  salePrice: new Prisma.Decimal('1200.00'),
  payoutAmount: new Prisma.Decimal('1015.20'),
  payoutStatus: PayoutStatus.pending,
  courierName: 'Porter.ae',
  awbNumber: 'AWB-123',
  createdAt: new Date('2026-07-01T10:00:00.000Z'),
  vendor: { id: VENDOR_ID, storeName: 'Gadget Hub' },
  product: {
    id: '22222222-2222-2222-2222-222222222222',
    conditionGrade: 'A',
    storageVariant: '256GB',
    color: 'Black',
    catalog: {
      model: 'iPhone 14 Pro',
      stockImageUrl: 'catalog/iphone-14-pro.png',
      brand: { name: 'Apple' },
    },
  },
};

function listQuery(
  overrides: Partial<ListOrdersQueryDto> = {},
): ListOrdersQueryDto {
  return Object.assign(new ListOrdersQueryDto(), {
    page: 1,
    limit: 20,
    ...overrides,
  });
}

describe('AdminOrdersService', () => {
  let service: AdminOrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(AdminOrdersService);
  });

  describe('list', () => {
    it('applies status, vendor, courier and date-range filters', async () => {
      prismaMock.subOrder.count.mockResolvedValue(0);
      prismaMock.subOrder.findMany.mockResolvedValue([]);

      await service.list(
        listQuery({
          status: OrderStatus.shipped,
          vendorId: VENDOR_ID,
          courier: 'porter',
          dateFrom: '2026-07-01T00:00:00.000Z',
          dateTo: '2026-07-31T23:59:59.999Z',
        }),
      );

      const where = prismaMock.subOrder.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(OrderStatus.shipped);
      expect(where.vendorId).toBe(VENDOR_ID);
      expect(where.courierName).toEqual({
        contains: 'porter',
        mode: 'insensitive',
      });
      expect(where.createdAt.gte).toEqual(new Date('2026-07-01T00:00:00.000Z'));
      expect(where.createdAt.lte).toEqual(
        new Date('2026-07-31T23:59:59.999Z'),
      );
    });

    it('builds an OR search over sub-order number, product model and store name', async () => {
      prismaMock.subOrder.count.mockResolvedValue(0);
      prismaMock.subOrder.findMany.mockResolvedValue([]);

      await service.list(listQuery({ search: 'iphone' }));

      const where = prismaMock.subOrder.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { subOrderNumber: { contains: 'iphone', mode: 'insensitive' } },
        { product: { catalog: { model: { contains: 'iphone', mode: 'insensitive' } } } },
        { vendor: { storeName: { contains: 'iphone', mode: 'insensitive' } } },
      ]);
    });

    it('maps rows to the admin table shape with thumb, vendor and fraud stub', async () => {
      prismaMock.subOrder.count.mockResolvedValue(1);
      prismaMock.subOrder.findMany.mockResolvedValue([baseRow]);

      const { items, meta } = await service.list(listQuery());

      expect(meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      const row = items[0];
      expect(row.subOrderNumber).toBe('SUB-041');
      expect(row.product).toEqual({
        id: baseRow.product.id,
        model: 'iPhone 14 Pro',
        brand: 'Apple',
        thumbnailUrl: 'catalog/iphone-14-pro.png',
        storageVariant: '256GB',
        color: 'Black',
        conditionGrade: 'A',
      });
      expect(row.vendor).toEqual({ id: VENDOR_ID, storeName: 'Gadget Hub' });
      expect(row.courierName).toBe('Porter.ae');
      expect(row.hasFraudFlag).toBe(false);
      expect(typeof row.elapsedMs).toBe('number');
    });

    it('returns null vendor for C2C sub-orders', async () => {
      prismaMock.subOrder.count.mockResolvedValue(1);
      prismaMock.subOrder.findMany.mockResolvedValue([
        { ...baseRow, vendor: null },
      ]);

      const { items } = await service.list(listQuery());
      expect(items[0].vendor).toBeNull();
    });

    it('omits the createdAt filter when no dates are given', async () => {
      prismaMock.subOrder.count.mockResolvedValue(0);
      prismaMock.subOrder.findMany.mockResolvedValue([]);

      await service.list(listQuery());

      const where = prismaMock.subOrder.findMany.mock.calls[0][0].where;
      expect(where.createdAt).toBeUndefined();
    });
  });
});
