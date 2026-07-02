import { Prisma } from '@prisma/client';
import {
  DEFAULT_MAMO_FEE_RATE,
  computeCommission,
  computePayout,
  computePayoutBreakdown,
  computeProcessingFee,
} from './payout.util';

describe('payout.util', () => {
  describe('computeProcessingFee', () => {
    it('applies the default Mamo rate (2.9%) rounded to 2 dp', () => {
      // 1000 × 0.029 = 29.00
      expect(computeProcessingFee(1000).toFixed(2)).toBe('29.00');
    });

    it('rounds half-up to 2 dp', () => {
      // 199.99 × 0.029 = 5.799710 -> 5.80
      expect(computeProcessingFee('199.99').toFixed(2)).toBe('5.80');
    });

    it('honours an explicit rate', () => {
      expect(computeProcessingFee(500, 0.05).toFixed(2)).toBe('25.00');
    });
  });

  describe('computeCommission', () => {
    it('treats commissionRate as a percentage', () => {
      // 1000 × 10 / 100 = 100.00
      expect(computeCommission(1000, 10).toFixed(2)).toBe('100.00');
    });

    it('handles fractional rates and rounds to 2 dp', () => {
      // 1499.50 × 12.5 / 100 = 187.4375 -> 187.44
      expect(computeCommission('1499.50', '12.5').toFixed(2)).toBe('187.44');
    });
  });

  describe('computePayout', () => {
    it('computes salePrice − commission − processingFee', () => {
      // 1000 − (10%) 100 − (2.9%) 29 = 871.00
      expect(computePayout(1000, 10).toFixed(2)).toBe('871.00');
    });

    it('accepts Prisma.Decimal inputs', () => {
      const sale = new Prisma.Decimal('2500.00');
      const rate = new Prisma.Decimal('15');
      // 2500 − 375 − 72.50 = 2052.50
      expect(computePayout(sale, rate).toFixed(2)).toBe('2052.50');
    });
  });

  describe('computePayoutBreakdown', () => {
    it('returns each component and a self-consistent total', () => {
      const b = computePayoutBreakdown('1299.00', '10', DEFAULT_MAMO_FEE_RATE);
      expect(b.commission.toFixed(2)).toBe('129.90');
      expect(b.processingFee.toFixed(2)).toBe('37.67'); // 1299 × 0.029 = 37.671
      expect(b.payoutAmount.toFixed(2)).toBe('1131.43'); // 1299 − 129.90 − 37.67
      // payout == sale − commission − fee
      const check = b.salePrice
        .minus(b.commission)
        .minus(b.processingFee)
        .toFixed(2);
      expect(b.payoutAmount.toFixed(2)).toBe(check);
    });

    it('snapshots the commission rate onto the breakdown', () => {
      const b = computePayoutBreakdown(1000, 7.5);
      expect(b.commissionRate.toString()).toBe('7.5');
    });
  });

  it('exposes the default Mamo fee rate', () => {
    expect(DEFAULT_MAMO_FEE_RATE).toBe(0.029);
  });
});
