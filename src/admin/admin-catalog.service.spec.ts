import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AdminCatalogService } from './admin-catalog.service';
import { CreateCatalogProductDto } from './dto/create-catalog-product.dto';
import { ListCatalogQueryDto } from './dto/list-catalog.dto';
import { UpdateCatalogProductDto } from './dto/update-catalog-product.dto';

const prismaMock = {
  productCatalog: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  brand: { findUnique: jest.fn() },
  category: { findUnique: jest.fn() },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const BRAND_ID = '22222222-2222-2222-2222-222222222222';
const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';

const baseEntry = {
  id: '11111111-1111-1111-1111-111111111111',
  brandId: BRAND_ID,
  model: 'iPhone 14 Pro',
  year: 2022,
  categoryId: CATEGORY_ID,
  stockImageUrl: null,
  specs: { storage: ['128GB'], colors: ['Silver'], keySpecs: ['A16 Bionic'] },
  description: 'A pro phone.',
  status: CatalogStatus.active,
  createdAt: new Date(),
  deletedAt: null as Date | null,
};

function buildListQuery(o: Partial<ListCatalogQueryDto> = {}): ListCatalogQueryDto {
  return Object.assign(new ListCatalogQueryDto(), { page: 1, limit: 20, ...o });
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('AdminCatalogService', () => {
  let service: AdminCatalogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.brand.findUnique.mockResolvedValue({ deletedAt: null });
    prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCatalogService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(AdminCatalogService);
  });

  describe('list', () => {
    it('hides archived rows by default and paginates', async () => {
      prismaMock.productCatalog.count.mockResolvedValue(1);
      prismaMock.productCatalog.findMany.mockResolvedValue([baseEntry]);

      const result = await service.list(buildListQuery({ page: 2, limit: 10 }));

      const findArgs = prismaMock.productCatalog.findMany.mock.calls[0][0];
      expect(findArgs.where.deletedAt).toBeNull();
      expect(findArgs.skip).toBe(10);
      expect(findArgs.take).toBe(10);
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
    });

    it('builds status/categoryId/brandId/search filters', async () => {
      prismaMock.productCatalog.count.mockResolvedValue(0);
      prismaMock.productCatalog.findMany.mockResolvedValue([]);

      await service.list(
        buildListQuery({
          status: CatalogStatus.draft,
          categoryId: CATEGORY_ID,
          brandId: BRAND_ID,
          search: 'macbook',
          includeDeleted: true,
        }),
      );

      const where = prismaMock.productCatalog.findMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeUndefined();
      expect(where.status).toBe(CatalogStatus.draft);
      expect(where.categoryId).toBe(CATEGORY_ID);
      expect(where.brandId).toBe(BRAND_ID);
      expect(where.OR).toEqual([
        { brand: { name: { contains: 'macbook', mode: 'insensitive' } } },
        { model: { contains: 'macbook', mode: 'insensitive' } },
        { category: { name: { contains: 'macbook', mode: 'insensitive' } } },
      ]);
    });
  });

  describe('getById', () => {
    it('returns the entry when found', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(baseEntry);
      await expect(service.getById(baseEntry.id)).resolves.toBe(baseEntry);
    });

    it('throws NotFound when missing', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(null);
      await expect(service.getById(baseEntry.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const dto: CreateCatalogProductDto = {
      brandId: BRAND_ID,
      model: 'iPhone 15 Pro',
      year: 2023,
      categoryId: CATEGORY_ID,
      specs: { storage: ['256GB'], colors: ['Black'], keySpecs: ['A17 Pro'] },
      description: 'Newer pro phone.',
    };

    it('validates refs, defaults status to active and persists specs JSON', async () => {
      prismaMock.productCatalog.create.mockResolvedValue({ ...baseEntry, ...dto });

      await service.create(dto);

      expect(prismaMock.brand.findUnique).toHaveBeenCalledWith({
        where: { id: BRAND_ID },
        select: { deletedAt: true },
      });
      const data = prismaMock.productCatalog.create.mock.calls[0][0].data;
      expect(data.status).toBe(CatalogStatus.active);
      expect(data.brandId).toBe(BRAND_ID);
      expect(data.categoryId).toBe(CATEGORY_ID);
      expect(data.specs).toEqual(dto.specs);
    });

    it('rejects a missing/archived brand with BadRequest', async () => {
      prismaMock.brand.findUnique.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.productCatalog.create).not.toHaveBeenCalled();
    });

    it('rejects an archived category with BadRequest', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: new Date() });
      await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps a unique-constraint clash to ConflictException', async () => {
      prismaMock.productCatalog.create.mockRejectedValue(uniqueViolation());
      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('updates only provided keys and connects brand when brandId sent', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(baseEntry);
      prismaMock.productCatalog.update.mockResolvedValue(baseEntry);

      const dto: UpdateCatalogProductDto = { status: CatalogStatus.draft, brandId: BRAND_ID };
      await service.update(baseEntry.id, dto);

      const data = prismaMock.productCatalog.update.mock.calls[0][0].data;
      expect(data.status).toBe(CatalogStatus.draft);
      expect(data.brand).toEqual({ connect: { id: BRAND_ID } });
      expect('year' in data).toBe(false);
      expect('specs' in data).toBe(false);
    });

    it('rejects updating with an invalid brand', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(baseEntry);
      prismaMock.brand.findUnique.mockResolvedValue(null);
      await expect(
        service.update(baseEntry.id, { brandId: BRAND_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects updating an archived entry', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue({
        ...baseEntry,
        deletedAt: new Date(),
      });
      await expect(
        service.update(baseEntry.id, { model: 'X' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFound when the entry does not exist', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(null);
      await expect(
        service.update(baseEntry.id, { model: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('archives an active entry', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(baseEntry);
      prismaMock.productCatalog.update.mockResolvedValue(baseEntry);

      const result = await service.softDelete(baseEntry.id);

      const data = prismaMock.productCatalog.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(result).toEqual({ id: baseEntry.id, deleted: true });
    });

    it('throws NotFound when missing', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(null);
      await expect(service.softDelete(baseEntry.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('clears deletedAt on an archived entry', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue({
        ...baseEntry,
        deletedAt: new Date(),
      });
      prismaMock.productCatalog.update.mockResolvedValue(baseEntry);

      const result = await service.restore(baseEntry.id);

      const data = prismaMock.productCatalog.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeNull();
      expect(result).toEqual({ id: baseEntry.id, restored: true });
    });

    it('rejects restoring an entry that is not archived', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(baseEntry);
      await expect(service.restore(baseEntry.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
