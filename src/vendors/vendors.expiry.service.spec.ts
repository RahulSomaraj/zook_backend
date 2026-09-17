import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { VendorsService } from './vendors.service';

describe('VendorsService.getTradeEmirtesExpiry', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const vendorId = '22222222-2222-2222-2222-222222222222';
  const prisma = {
    vendor: { findUnique: jest.fn() },
    vendorKyc: { findFirst: jest.fn() },
  };
  const service = new VendorsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vendor.findUnique.mockResolvedValue({ id: vendorId });
  });

  it('returns expiry dates from the latest KYC for the authenticated vendor', async () => {
    const expiryDates = {
      tradeLicenseExpiry: new Date('2026-12-31T00:00:00.000Z'),
      emiratesIdExpiry: new Date('2027-12-31T00:00:00.000Z'),
    };
    prisma.vendorKyc.findFirst.mockResolvedValue(expiryDates);

    await expect(service.getTradeEmirtesExpiry(userId)).resolves.toEqual(
      expiryDates,
    );
    expect(prisma.vendor.findUnique).toHaveBeenCalledWith({
      where: { userId },
      select: expect.any(Object),
    });
    expect(prisma.vendorKyc.findFirst).toHaveBeenCalledWith({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      select: { tradeLicenseExpiry: true, emiratesIdExpiry: true },
    });
  });

  it('returns null dates when the vendor has not submitted KYC', async () => {
    prisma.vendorKyc.findFirst.mockResolvedValue(null);

    await expect(service.getTradeEmirtesExpiry(userId)).resolves.toEqual({
      tradeLicenseExpiry: null,
      emiratesIdExpiry: null,
    });
  });

  it('rejects an unknown vendor without querying KYC', async () => {
    prisma.vendor.findUnique.mockResolvedValue(null);

    await expect(service.getTradeEmirtesExpiry(userId)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.vendorKyc.findFirst).not.toHaveBeenCalled();
  });
});
