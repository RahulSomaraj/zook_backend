import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../database/prisma.service';
import { AdminFeeSettingsController } from './admin-fee-settings.controller';
import { AdminFeeSettingsService } from './admin-fee-settings.service';

describe('Admin fee settings endpoint', () => {
  let app: INestApplication;
  const upsert = jest.fn();
  const findUnique = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminFeeSettingsController],
      providers: [
        AdminFeeSettingsService,
        {
          provide: PrismaService,
          useValue: { feeSettings: { upsert, findUnique } },
        },
      ],
    })
      // Substitute authentication only; the real RolesGuard must authorize
      // the controller's admin role before any write can happen.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          const token = req.headers.authorization;
          if (!token) throw new UnauthorizedException();
          req.user = { roles: [token.replace('Bearer ', '')] };
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
    upsert.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue({
      id: 1,
      commissionRate: new Prisma.Decimal(10),
      mamoFeeRate: new Prisma.Decimal('0.029'),
      updatedAt: new Date('2026-09-17T12:00:00Z'),
    });
    upsert.mockImplementation(async ({ where, update }) => ({
      id: where.id,
      ...update,
      updatedAt: new Date('2026-09-17T12:00:00Z'),
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  const validBody = { commissionPercentage: 10, mamoPercentage: 2.9 };

  it('reads saved fees as percentages without modifying settings', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/fee-settings')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(response.body).toEqual({
      id: 1,
      ...validBody,
      updatedAt: '2026-09-17T12:00:00.000Z',
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when fee settings are missing', async () => {
    findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/api/admin/fee-settings')
      .set('Authorization', 'Bearer admin')
      .expect(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each(['vendor', 'customer', 'inspector'])(
    'rejects reads by the %s role',
    async (role) => {
      await request(app.getHttpServer())
        .get('/api/admin/fee-settings')
        .set('Authorization', `Bearer ${role}`)
        .expect(403);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('requires authentication to read fees', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/fee-settings')
      .expect(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('accepts percentages and writes the singleton with Mamo stored as a fraction', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/fee-settings')
      .set('Authorization', 'Bearer admin')
      .send(validBody)
      .expect(200);
    expect(response.body).toMatchObject({ id: 1, ...validBody });
    const write = upsert.mock.calls[0][0];
    expect(write.where).toEqual({ id: 1 });
    expect(write.create.id).toBe(1);
    for (const data of [write.create, write.update]) {
      expect(data.commissionRate.toString()).toBe('10');
      expect(data.mamoFeeRate.toString()).toBe('0.029');
    }
  });

  it.each(['vendor', 'customer', 'inspector'])(
    'rejects the %s role',
    async (role) => {
      await request(app.getHttpServer())
        .post('/api/admin/fee-settings')
        .set('Authorization', `Bearer ${role}`)
        .send(validBody)
        .expect(403);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/fee-settings')
      .send(validBody)
      .expect(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { commissionPercentage: 10 },
    { ...validBody, commissionPercentage: -1 },
    { ...validBody, mamoPercentage: 101 },
    { ...validBody, commissionPercentage: 10.123 },
    { ...validBody, mamoPercentage: 2.999 },
    { ...validBody, commissionPercentage: null },
    { ...validBody, mamoPercentage: '' },
    { ...validBody, mamoPercentage: true },
    { ...validBody, mamoPercentage: '2.9' },
    { ...validBody, id: 2 },
    { commissionPercentage: 99, mamoPercentage: 2 },
  ])('rejects invalid fee input %j', async (body) => {
    await request(app.getHttpServer())
      .post('/api/admin/fee-settings')
      .set('Authorization', 'Bearer admin')
      .send(body)
      .expect(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([0, 100])('accepts a total fee of %s percent', async (total) => {
    await request(app.getHttpServer())
      .post('/api/admin/fee-settings')
      .set('Authorization', 'Bearer admin')
      .send({ commissionPercentage: total, mamoPercentage: 0 })
      .expect(200);
    expect(upsert.mock.calls[0][0].update.mamoFeeRate).toEqual(
      new Prisma.Decimal(0),
    );
  });
});
