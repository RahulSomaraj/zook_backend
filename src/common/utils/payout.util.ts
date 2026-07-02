import { Prisma } from '@prisma/client';

/**
 * Vendor payout maths, in one place so every caller (checkout, admin orders,
 * C2C publish, dashboard) computes the same numbers.
 *
 *   processingFee = salePrice × mamoFeeRate            (Mamo gateway cut, ~2.9%)
 *   commission    = salePrice × commissionRate / 100   (platform cut, snapshot rate)
 *   payout        = salePrice − commission − processingFee
 *
 * All money is Prisma.Decimal (never float) and rounded to 2 dp, matching the
 * `Decimal(10,2)` columns on `sub_orders`. Rates are decimals: `commissionRate`
 * is a percentage (e.g. 10 = 10%), `mamoFeeRate` is a fraction (e.g. 0.029).
 */

const Decimal = Prisma.Decimal;
type DecimalInput = Prisma.Decimal | number | string;

/**
 * Default Mamo Pay processing-fee rate (2.9%). Callers should pass the value
 * from config (`payments.mamoFeeRate`, env `MAMO_FEE_RATE`); this is the
 * fallback used by unit tests and any code without a ConfigService in scope.
 */
export const DEFAULT_MAMO_FEE_RATE = 0.029;

/** Round a Decimal to 2 dp, half-up — the rounding used for all stored money. */
function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Mamo processing fee: `salePrice × mamoFeeRate`, rounded to 2 dp. */
export function computeProcessingFee(
  salePrice: DecimalInput,
  mamoFeeRate: DecimalInput = DEFAULT_MAMO_FEE_RATE,
): Prisma.Decimal {
  return money(new Decimal(salePrice).mul(new Decimal(mamoFeeRate)));
}

/** Platform commission: `salePrice × commissionRate / 100`, rounded to 2 dp. */
export function computeCommission(
  salePrice: DecimalInput,
  commissionRate: DecimalInput,
): Prisma.Decimal {
  return money(new Decimal(salePrice).mul(new Decimal(commissionRate)).div(100));
}

export interface PayoutBreakdown {
  salePrice: Prisma.Decimal;
  commissionRate: Prisma.Decimal;
  commission: Prisma.Decimal;
  processingFee: Prisma.Decimal;
  payoutAmount: Prisma.Decimal;
}

/**
 * Full payout breakdown for a sub-order. Snapshot `commissionRate` onto the row
 * at sale time and store `processingFee` + `payoutAmount` alongside it so the
 * numbers never move when config or a vendor's rate later changes.
 */
export function computePayoutBreakdown(
  salePrice: DecimalInput,
  commissionRate: DecimalInput,
  mamoFeeRate: DecimalInput = DEFAULT_MAMO_FEE_RATE,
): PayoutBreakdown {
  const sale = new Decimal(salePrice);
  const rate = new Decimal(commissionRate);
  const commission = computeCommission(sale, rate);
  const processingFee = computeProcessingFee(sale, mamoFeeRate);
  const payoutAmount = money(sale.minus(commission).minus(processingFee));
  return {
    salePrice: money(sale),
    commissionRate: rate,
    commission,
    processingFee,
    payoutAmount,
  };
}

/**
 * Just the final payout figure: `salePrice − commission − processingFee`.
 * Prefer {@link computePayoutBreakdown} when you also need to persist the
 * commission/fee components.
 */
export function computePayout(
  salePrice: DecimalInput,
  commissionRate: DecimalInput,
  mamoFeeRate: DecimalInput = DEFAULT_MAMO_FEE_RATE,
): Prisma.Decimal {
  return computePayoutBreakdown(salePrice, commissionRate, mamoFeeRate)
    .payoutAmount;
}
