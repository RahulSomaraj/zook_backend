import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;
type DecimalInput = Prisma.Decimal | number | string;

/**
 * Amount the courier must collect for each parcel of a cash-on-delivery order:
 * the sub-order's sale price plus its share of the order's delivery fee.
 *
 * The fee is split evenly, rounded down to 2 dp, and the rounding remainder is
 * added to the first parcel, so the collected amounts always sum to exactly
 * `subtotal + deliveryFee`. Computed once at checkout and stored on each
 * sub-order (`SubOrder.codAmount`); never recomputed from the parent total.
 */
export function allocateCodAmounts(
  salePrices: ReadonlyArray<DecimalInput>,
  deliveryFee: DecimalInput,
): Prisma.Decimal[] {
  if (salePrices.length === 0) return [];
  const fee = new Decimal(deliveryFee);
  if (fee.isNegative() || !fee.isFinite()) {
    throw new RangeError('deliveryFee must be a non-negative amount');
  }
  const share = fee
    .div(salePrices.length)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const remainder = fee.minus(share.mul(salePrices.length));
  return salePrices.map((price, index) =>
    new Decimal(price)
      .plus(share)
      .plus(index === 0 ? remainder : 0)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  );
}
