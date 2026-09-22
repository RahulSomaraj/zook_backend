import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
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
  const userId = '22222222-2222-4222-8222-222222222222';
  const path = '/api/vendors/me/payout-preview';
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
          const req = context.switchToHttp().getRequest<{
            headers: { authorization?: string };
            user?: { id: string; roles: string[] };
          }>();
          const authorization = req.headers.authorization;
          if (!authorization) throw new UnauthorizedException();
          req.user = {
            id: userId,
            roles: [authorization.replace('Bearer ', '')],
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findProduct.mockResolvedValue({ price: new Prisma.Decimal('100') });
    findSettings.mockResolvedValue({
      id: 1,
      commissionRate: new Prisma.Decimal('10'),
      mamoFeeRate: new Prisma.Decimal('0.029'),
      updatedAt: new Date('2026-09-18T12:00:00Z'),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets vendors read platform fees as percentages without requiring a product', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/vendors/me/fee-settings')
      .set('Authorization', 'Bearer vendor')
      .expect(200);
    expect(response.body).toEqual({
      id: 1,
      commissionPercentage: 10,
      mamoPercentage: 2.9,
      updatedAt: '2026-09-18T12:00:00.000Z',
    });
    expect(findSettings).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        id: true,
        commissionRate: true,
        mamoFeeRate: true,
        updatedAt: true,
      },
    });
    expect(findProduct).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested fee settings are missing', async () => {
    findSettings.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/api/vendors/me/fee-settings')
      .set('Authorization', 'Bearer vendor')
      .expect(404);
  });

  it('requires authentication to read fee settings', async () => {
    await request(app.getHttpServer())
      .get('/api/vendors/me/fee-settings')
      .expect(401);
    expect(findSettings).not.toHaveBeenCalled();
  });

  it.each(['customer', 'inspector', 'admin'])(
    'rejects fee settings reads by the %s role',
    async (role) => {
      await request(app.getHttpServer())
        .get('/api/vendors/me/fee-settings')
        .set('Authorization', `Bearer ${role}`)
        .expect(403);
      expect(findSettings).not.toHaveBeenCalled();
    },
  );

  it('calculates the decimal fee breakdown from the frontend-supplied price', async () => {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer vendor')
      .send({ productPrice: 2100 })
      .expect(200);
    expect(response.body).toEqual({
      salePrice: '2100',
      commissionRate: '10',
      commission: '210',
      processingFee: '60.9',
      payoutAmount: '1829.1',
    });
    expect(findProduct).not.toHaveBeenCalled();
  });

  it.each(['customer', 'inspector', 'admin'])(
    'rejects the %s role',
    async (role) => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${role}`)
        .send({ productPrice: 2100 })
        .expect(403);
      expect(findProduct).not.toHaveBeenCalled();
    },
  );

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post(path)
      .send({ productPrice: 2100 })
      .expect(401);
    expect(findProduct).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { productPrice: 0 },
    { productPrice: -1 },
    { productPrice: 10.999 },
    { productPrice: '2100' },
    { productPrice: true },
    { productPrice: null },
    { productPrice: 2100, productId: 'unexpected' },
  ])('rejects invalid frontend price input %j', async (body) => {
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer vendor')
      .send(body)
      .expect(400);
    expect(findSettings).not.toHaveBeenCalled();
  });

  it('returns 503 when fee settings are missing', async () => {
    findSettings.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer vendor')
      .send({ productPrice: 2100 })
      .expect(503);
  });
});
