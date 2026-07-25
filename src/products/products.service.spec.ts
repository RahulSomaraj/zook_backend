import { ProductsService } from './products.service';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';

function makePrisma() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    product: { findMany, count },
    // list() builds [findMany(...), count(...)] then awaits $transaction.
    $transaction: jest.fn().mockResolvedValue([[], 0]),
  } as any;
  return { prisma, findMany, count };
}

function query(overrides: Partial<QueryProductsDto>): QueryProductsDto {
  return Object.assign(new QueryProductsDto(), overrides);
}

describe('ProductsService.list — filters, sort, pagination', () => {
  it('defaults to newest-first with the buyer-visible base scope (no country)', async () => {
    const { prisma, findMany } = makePrisma();
    await new ProductsService(prisma).list(query({}));

    const arg = findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.where.isActive).toBe(true);
    expect(arg.where.stockQty).toEqual({ gt: 0 });
    // C2C + approved-vendor OR when no country is given.
    expect(arg.where.OR).toBeDefined();
  });

  it('scopes to a country by vendor when country is provided', async () => {
    const { prisma, findMany } = makePrisma();
    await new ProductsService(prisma).list(query({ country: 'ae' }));

    const where = findMany.mock.calls[0][0].where;
    expect(where.vendor).toMatchObject({ country: { iso2: 'AE' } });
    expect(where.OR).toBeUndefined();
  });

  it('maps each sort value to the right orderBy', async () => {
    const cases: [ProductSort, unknown][] = [
      [ProductSort.RECENT, { createdAt: 'desc' }],
      [ProductSort.OLDEST, { createdAt: 'asc' }],
      [ProductSort.PRICE_LOW, [{ price: 'asc' }, { createdAt: 'desc' }]],
      [ProductSort.PRICE_HIGH, [{ price: 'desc' }, { createdAt: 'desc' }]],
      [ProductSort.TOP_PICKS, [{ price: 'desc' }, { createdAt: 'desc' }]],
    ];
    for (const [sort, expected] of cases) {
      const { prisma, findMany } = makePrisma();
      await new ProductsService(prisma).list(query({ sort }));
      expect(findMany.mock.calls[0][0].orderBy).toEqual(expected);
    }
  });

  it('applies scalar + catalog + price filters together', async () => {
    const { prisma, findMany } = makePrisma();
    await new ProductsService(prisma).list(
      query({
        source: 'c2c' as any,
        condition: 'good' as any,
        min_price: 100,
        max_price: 500,
        category_id: '11111111-1111-1111-1111-111111111111',
        brand_id: '22222222-2222-2222-2222-222222222222',
        search: 'iphone',
      }),
    );

    const where = findMany.mock.calls[0][0].where;
    expect(where.source).toBe('c2c');
    expect(where.conditionGrade).toBe('good');
    expect(where.price).toEqual({ gte: 100, lte: 500 });
    expect(where.catalog.categoryId).toBe('11111111-1111-1111-1111-111111111111');
    expect(where.catalog.brandId).toBe('22222222-2222-2222-2222-222222222222');
    expect(where.catalog.OR).toEqual([
      { model: { contains: 'iphone', mode: 'insensitive' } },
      { brand: { name: { contains: 'iphone', mode: 'insensitive' } } },
    ]);
  });

  it('paginates with skip/take and returns meta', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(42);
    const prisma = {
      product: { findMany, count },
      $transaction: jest.fn().mockResolvedValue([[], 42]),
    } as any;

    const res = await new ProductsService(prisma).list(
      query({ page: 3, limit: 10 }),
    );

    const arg = findMany.mock.calls[0][0];
    expect(arg.skip).toBe(20); // (3 - 1) * 10
    expect(arg.take).toBe(10);
    expect(res.meta).toEqual({ page: 3, limit: 10, total: 42, totalPages: 5 });
  });

  it('legacy aliases return the old { items } shape with preset sort', async () => {
    const { prisma, findMany } = makePrisma();
    const svc = new ProductsService(prisma);

    const recent = await svc.getRecentlyListed();
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    expect(findMany.mock.calls[0][0].take).toBe(20);
    expect(recent).toHaveProperty('items');
    expect(recent).not.toHaveProperty('meta');

    const picks = await svc.getTopPicks();
    expect(findMany.mock.calls[1][0].orderBy).toEqual([
      { price: 'desc' },
      { createdAt: 'desc' },
    ]);
  });
});
