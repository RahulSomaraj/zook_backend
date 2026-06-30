import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AdminBrandsService } from './admin-brands.service';
import { ListBrandQueryDto } from './dto/list-brand.dto';

const prismaMock = {
  brand: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const BRAND_ID = '22222222-2222-2222-2222-222222222222';
const baseBrand = {
  id: BRAND_ID,
  name: 'Apple',
  slug: 'apple',
  logoUrl: null,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  deletedAt: null as Date | null,
};

function listQuery(overrides: Partial<ListBrandQueryDto> = {}): ListBrandQueryDto {
  return Object.assign(new ListBrandQueryDto(), { page: 1, limit: 20, ...overrides });
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('AdminBrandsService', () => {
  let service: AdminBrandsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBrandsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(AdminBrandsService);
  });

  describe('list', () => {
    it('hides archived and applies isActive + search', async () => {
      prismaMock.brand.count.mockResolvedValue(1);
      prismaMock.brand.findMany.mockResolvedValue([baseBrand]);

      await service.list(listQuery({ isActive: true, search: 'app' }));

      const where = prismaMock.brand.findMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
      expect(where.isActive).toBe(true);
      expect(where.name).toEqual({ contains: 'app', mode: 'insensitive' });
    });

    it('includes archived when requested', async () => {
      prismaMock.brand.count.mockResolvedValue(0);
      prismaMock.brand.findMany.mockResolvedValue([]);
      await service.list(listQuery({ includeDeleted: true }));
      expect(prismaMock.brand.findMany.mock.calls[0][0].where.deletedAt).toBeUndefined();
    });
  });

  describe('create', () => {
    it('derives slug from name when omitted', async () => {
      prismaMock.brand.create.mockResolvedValue(baseBrand);
      await service.create({ name: 'Gaming Consoles!' });
      expect(prismaMock.brand.create.mock.calls[0][0].data.slug).toBe('gaming-consoles');
    });

    it('maps unique clash to ConflictException', async () => {
      prismaMock.brand.create.mockRejectedValue(uniqueViolation());
      await expect(service.create({ name: 'Apple' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('getById', () => {
    it('throws NotFound when missing', async () => {
      prismaMock.brand.findUnique.mockResolvedValue(null);
      await expect(service.getById(BRAND_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects updating an archived brand', async () => {
      prismaMock.brand.findUnique.mockResolvedValue({ ...baseBrand, deletedAt: new Date() });
      await expect(service.update(BRAND_ID, { name: 'X' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('softDelete / restore', () => {
    it('archives an active brand', async () => {
      prismaMock.brand.findUnique.mockResolvedValue(baseBrand);
      prismaMock.brand.update.mockResolvedValue(baseBrand);
      const result = await service.softDelete(BRAND_ID);
      expect(prismaMock.brand.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(result).toEqual({ id: BRAND_ID, deleted: true });
    });

    it('restores an archived brand', async () => {
      prismaMock.brand.findUnique.mockResolvedValue({ ...baseBrand, deletedAt: new Date() });
      prismaMock.brand.update.mockResolvedValue(baseBrand);
      const result = await service.restore(BRAND_ID);
      expect(prismaMock.brand.update.mock.calls[0][0].data.deletedAt).toBeNull();
      expect(result).toEqual({ id: BRAND_ID, restored: true });
    });

    it('rejects restoring a non-archived brand', async () => {
      prismaMock.brand.findUnique.mockResolvedValue(baseBrand);
      await expect(service.restore(BRAND_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
