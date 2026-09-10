import { Prisma } from '@prisma/client';
import { allocateCodAmounts } from './cod.util';

const amounts = (values: Prisma.Decimal[]) => values.map((v) => v.toFixed(2));

describe('allocateCodAmounts', () => {
  it('collects exactly the sale price per parcel when delivery is free', () => {
    expect(amounts(allocateCodAmounts(['1000.00', '250.50'], 0))).toEqual([
      '1000.00',
      '250.50',
    ]);
  });

  it('splits the delivery fee and gives the rounding remainder to the first parcel', () => {
    const result = allocateCodAmounts(['100', '100', '100'], '10.00');
    expect(amounts(result)).toEqual(['103.34', '103.33', '103.33']);
    const total = result.reduce((sum, v) => sum.plus(v), new Prisma.Decimal(0));
    expect(total.toFixed(2)).toBe('310.00');
  });

  it('adds the whole fee to a single parcel', () => {
    expect(
      amounts(allocateCodAmounts([new Prisma.Decimal('49.99')], 15)),
    ).toEqual(['64.99']);
  });

  it('returns nothing for no parcels and rejects negative fees', () => {
    expect(allocateCodAmounts([], 5)).toEqual([]);
    expect(() => allocateCodAmounts(['10'], -1)).toThrow(RangeError);
  });
});
