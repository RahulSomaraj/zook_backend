import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { VendorsService } from './vendors.service';

const prismaMock = {
  vendor: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  subOrder: { count: jest.fn(), aggregate: jest.fn() },
  product: { count: jest.fn() },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const VENDOR_ID = '22222222-2222-2222-2222-222222222222';

function sum(value: string) {
  return { _sum: { salePrice: new Prisma.Decimal(value) } };
}

describe('VendorsService.getDashboard', () => {
  let service: VendorsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(VendorsService);

    prismaMock.vendor.findUnique.mockResolvedValue({
      id: VENDOR_ID,
      storeName: 'Al Turath Electronics',
      currency: 'AED',
    });
    prismaMock.user.findUnique.mockResolvedValue({
      fullName: 'Ahmed Al Turath',
    });
  });

  it('assembles the header and three stat tiles from the aggregates', async () => {
    // Order matches how the service builds the $transaction array.
    prismaMock.subOrder.count
      .mockResolvedValueOnce(7) // orders today
      .mockResolvedValueOnce(4); // orders yesterday
    prismaMock.product.count
      .mockResolvedValueOnce(34) // live listings
      .mockResolvedValueOnce(1); // out of stock
    prismaMock.subOrder.aggregate
      .mockResolvedValueOnce(sum('11800.00')) // this month
      .mockResolvedValueOnce(sum('10000.00')); // last month

    const result = await service.getDashboard(USER_ID);

    expect(result).toEqual({
      header: { storeName: 'Al Turath Electronics', greetingName: 'Ahmed' },
      ordersToday: { count: 7, deltaVsYesterday: 3 },
      liveListings: { count: 34, outOfStock: 1 },
      thisMonth: { currency: 'AED', revenue: 11800, changePercent: 18 },
    });
  });

  it('scopes every query to the vendor and excludes cancelled orders', async () => {
    prismaMock.subOrder.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.subOrder.aggregate.mockResolvedValue(sum('0'));

    await service.getDashboard(USER_ID);

    const ordersTodayWhere = prismaMock.subOrder.count.mock.calls[0][0].where;
    expect(ordersTodayWhere.vendorId).toBe(VENDOR_ID);
    expect(ordersTodayWhere.status).toEqual({ not: OrderStatus.cancelled });

    const outOfStockWhere = prismaMock.product.count.mock.calls[1][0].where;
    expect(outOfStockWhere).toMatchObject({
      vendorId: VENDOR_ID,
      status: ProductStatus.approved,
      isActive: true,
      stockQty: 0,
    });
  });

  it('returns a negative delta when today trails yesterday', async () => {
    prismaMock.subOrder.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.subOrder.aggregate.mockResolvedValue(sum('0'));

    const result = await service.getDashboard(USER_ID);
    expect(result.ordersToday.deltaVsYesterday).toBe(-3);
  });

  it('reports null change when last month had no revenue', async () => {
    prismaMock.subOrder.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.subOrder.aggregate
      .mockResolvedValueOnce(sum('500.00')) // this month
      .mockResolvedValueOnce(sum('0')); // last month

    const result = await service.getDashboard(USER_ID);
    expect(result.thisMonth).toEqual({
      currency: 'AED',
      revenue: 500,
      changePercent: null,
    });
  });

  it('throws when the user has no vendor profile', async () => {
    prismaMock.vendor.findUnique.mockResolvedValueOnce(null);
    await expect(service.getDashboard(USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
