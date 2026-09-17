import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { VendorFeeCalController } from './vendor.fee.cal.controller';
import { VendorFeeCalService } from './vendor.fee.cal.service';

describe('Vendor payout API', () => {
  let app: INestApplication;
  const productId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const path = `/api/vendors/me/products/${productId}/payout`;
  const findProduct = jest.fn();
  const findSettings = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VendorFeeCalController],
      providers: [
        VendorFeeCalService,
        {
          provide: PrismaService,
          useValue: {
            product: { findFirst: findProduct },
            feeSettings: { findUnique: findSettings },
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) throw new UnauthorizedException();
          req.user = {
            id: userId,
            roles: [req.headers.authorization.replace('Bearer ', '')],
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findProduct.mockResolvedValue({ price: new Prisma.Decimal('100') });
    findSettings.mockResolvedValue({
      commissionRate: new Prisma.Decimal('10'),
      mamoFeeRate: new Prisma.Decimal('0.029'),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the decimal fee breakdown and scopes the product to the authenticated vendor', async () => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer vendor')
      .expect(200);
    expect(response.body).toEqual({
      salePrice: '100',
      commissionRate: '10',
      commission: '10',
      processingFee: '2.9',
      payoutAmount: '87.1',
    });
    expect(findProduct).toHaveBeenCalledWith({
      where: {
        id: productId,
        source: 'vendor',
        vendor: { userId, deletedAt: null },
      },
      select: { price: true },
    });
  });

  it.each(['customer', 'inspector', 'admin'])(
    'rejects the %s role',
    async (role) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${role}`)
        .expect(403);
      expect(findProduct).not.toHaveBeenCalled();
    },
  );

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(findProduct).not.toHaveBeenCalled();
  });

  it('rejects malformed product IDs before querying', async () => {
    await request(app.getHttpServer())
      .get('/api/vendors/me/products/invalid/payout')
      .set('Authorization', 'Bearer vendor')
      .expect(400);
    expect(findProduct).not.toHaveBeenCalled();
  });

  it('returns 404 when no product matches the ownership filter', async () => {
    findProduct.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer vendor')
      .expect(404);
    expect(findSettings).not.toHaveBeenCalled();
  });

  it('returns 503 when fee settings are missing', async () => {
    findSettings.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer vendor')
      .expect(503);
  });
});
