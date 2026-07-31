import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AdminProductSpecificationsService } from './admin-product-specifications.service';
import { ListProductSpecificationQueryDto } from './dto/list-product-specification.dto';

const prismaMock = {
  productSpecification: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  productCatalog: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  categorySpecification: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const CATALOG_ID = '55555555-5555-5555-5555-555555555555';
const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const SPEC_ID = '44444444-4444-4444-4444-444444444444';
const ROW_ID = '66666666-6666-6666-6666-666666666666';

const definition = {
  id: SPEC_ID,
  label: 'RAM',
  sortOrder: 2,
  isActive: true,
  categoryId: CATEGORY_ID,
  deletedAt: null as Date | null,
};

describe('AdminProductSpecificationsService', () => {
  let service: AdminProductSpecificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.productCatalog.findUnique.mockResolvedValue({
      categoryId: CATEGORY_ID,
      deletedAt: null,
    });
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductSpecificationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(AdminProductSpecificationsService);
  });

  describe('listAll', () => {
    const row = {
      id: ROW_ID,
      catalogId: CATALOG_ID,
      specId: SPEC_ID,
      label: 'RAM',
      value: '4 GB',
      catalog: {
        id: CATALOG_ID,
        model: 'iPhone 13',
        year: 2021,
        brand: { name: 'Apple' },
        category: { id: CATEGORY_ID, name: 'Smartphones' },
      },
    };

    function query(overrides = {}) {
      return Object.assign(new ListProductSpecificationQueryDto(), {
        page: 1,
        limit: 20,
        grouped: false, // these cases cover the row-per-spec shape
        ...overrides,
      });
    }

    it('flattens each row to product / label / value', async () => {
      prismaMock.productSpecification.count.mockResolvedValue(1);
      prismaMock.productSpecification.findMany.mockResolvedValue([row]);

      const page: any = await service.listAll(query());

      expect(page.items[0]).toEqual({
        id: ROW_ID,
        catalogId: CATALOG_ID,
        product: 'Apple iPhone 13',
        year: 2021,
        category: 'Smartphones',
        label: 'RAM',
        value: '4 GB',
        specId: SPEC_ID,
      });
      expect(page.meta).toMatchObject({ total: 1, page: 1, limit: 20 });
    });

    it('hides specs of archived catalog entries', async () => {
      prismaMock.productSpecification.count.mockResolvedValue(0);
      prismaMock.productSpecification.findMany.mockResolvedValue([]);

      await service.listAll(query());

      const where =
        prismaMock.productSpecification.findMany.mock.calls[0][0].where;
      expect(where.catalog).toEqual({ deletedAt: null });
    });

    it('searches model, label and value together', async () => {
      prismaMock.productSpecification.count.mockResolvedValue(0);
      prismaMock.productSpecification.findMany.mockResolvedValue([]);

      await service.listAll(query({ search: '128 GB' }));

      const where =
        prismaMock.productSpecification.findMany.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(3);
      expect(where.OR[2]).toEqual({
        catalog: { model: { contains: '128 GB', mode: 'insensitive' } },
      });
    });

    it('keeps the archived-catalog filter when narrowing by category', async () => {
      prismaMock.productSpecification.count.mockResolvedValue(0);
      prismaMock.productSpecification.findMany.mockResolvedValue([]);

      await service.listAll(query({ categoryId: CATEGORY_ID }));

      const where =
        prismaMock.productSpecification.findMany.mock.calls[0][0].where;
      expect(where.catalog).toEqual({
        deletedAt: null,
        categoryId: CATEGORY_ID,
      });
    });

    it('separates linked rows from free-text ones', async () => {
      prismaMock.productSpecification.count.mockResolvedValue(0);
      prismaMock.productSpecification.findMany.mockResolvedValue([]);

      await service.listAll(query({ linkedOnly: false }));
      expect(
        prismaMock.productSpecification.findMany.mock.calls[0][0].where.specId,
      ).toBeNull();

      await service.listAll(query({ linkedOnly: true }));
      expect(
        prismaMock.productSpecification.findMany.mock.calls[1][0].where.specId,
      ).toEqual({ not: null });
    });
  });

  describe('listAll grouped (the default)', () => {
    const catalog = {
      id: CATALOG_ID,
      model: 'iPhone 13',
      year: 2021,
      brand: { name: 'Apple' },
      category: { name: 'Smartphones' },
      specifications: [
        { label: 'Display', value: '6.1-inch Super Retina XDR OLED' },
        { label: 'Chipset', value: 'A15 Bionic (5 nm)' },
      ],
    };

    function query(overrides = {}) {
      return Object.assign(new ListProductSpecificationQueryDto(), {
        page: 1,
        limit: 20,
        grouped: true,
        ...overrides,
      });
    }

    it('pivots each spec label into a key on the product', async () => {
      prismaMock.productCatalog.count.mockResolvedValue(1);
      prismaMock.productCatalog.findMany.mockResolvedValue([catalog]);

      const page: any = await service.listAll(query());

      expect(page.items[0]).toEqual({
        catalogId: CATALOG_ID,
        product: 'Apple iPhone 13',
        year: 2021,
        category: 'Smartphones',
        Display: '6.1-inch Super Retina XDR OLED',
        Chipset: 'A15 Bionic (5 nm)',
      });
    });

    it('counts products, not spec rows', async () => {
      prismaMock.productCatalog.count.mockResolvedValue(3);
      prismaMock.productCatalog.findMany.mockResolvedValue([catalog]);

      const page: any = await service.listAll(query());

      expect(page.meta.total).toBe(3);
      expect(prismaMock.productSpecification.findMany).not.toHaveBeenCalled();
    });

    it('prefixes a label that would clobber the product metadata', async () => {
      prismaMock.productCatalog.count.mockResolvedValue(1);
      prismaMock.productCatalog.findMany.mockResolvedValue([
        {
          ...catalog,
          specifications: [{ label: 'category', value: 'should not win' }],
        },
      ]);

      const page: any = await service.listAll(query());

      // The real category survives; the colliding spec is namespaced, not lost.
      expect(page.items[0].category).toBe('Smartphones');
      expect(page.items[0]['spec_category']).toBe('should not win');
    });

    it('hides archived catalog entries', async () => {
      prismaMock.productCatalog.count.mockResolvedValue(0);
      prismaMock.productCatalog.findMany.mockResolvedValue([]);

      await service.listAll(query());

      expect(
        prismaMock.productCatalog.findMany.mock.calls[0][0].where.deletedAt,
      ).toBeNull();
    });
  });

  describe('create with a definition', () => {
    it('copies the label and default order from the definition', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue(definition);
      prismaMock.productSpecification.create.mockResolvedValue({});

      await service.create(CATALOG_ID, { specId: SPEC_ID, value: '16 GB' });

      const data = prismaMock.productSpecification.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        catalogId: CATALOG_ID,
        specId: SPEC_ID,
        label: 'RAM', // copied, not typed
        value: '16 GB',
        sortOrder: 2, // the definition's own order
      });
    });

    it('lets an explicit sortOrder win over the definition', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue(definition);
      prismaMock.productSpecification.create.mockResolvedValue({});

      await service.create(CATALOG_ID, {
        specId: SPEC_ID,
        value: '16 GB',
        sortOrder: 9,
      });

      expect(
        prismaMock.productSpecification.create.mock.calls[0][0].data.sortOrder,
      ).toBe(9);
    });

    it('rejects a definition from another category', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue({
        ...definition,
        categoryId: 'a-different-category',
      });

      await expect(
        service.create(CATALOG_ID, { specId: SPEC_ID, value: '16 GB' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.productSpecification.create).not.toHaveBeenCalled();
    });

    it('rejects an archived definition', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue({
        ...definition,
        deletedAt: new Date(),
      });

      await expect(
        service.create(CATALOG_ID, { specId: SPEC_ID, value: '16 GB' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an inactive definition', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue({
        ...definition,
        isActive: false,
      });

      await expect(
        service.create(CATALOG_ID, { specId: SPEC_ID, value: '16 GB' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('create with a free-text label', () => {
    it('stores a null specId', async () => {
      prismaMock.productSpecification.create.mockResolvedValue({});

      await service.create(CATALOG_ID, {
        label: 'Box contents',
        value: 'Cable',
      });

      const data = prismaMock.productSpecification.create.mock.calls[0][0].data;
      expect(data.specId).toBeNull();
      expect(data.label).toBe('Box contents');
      expect(data.value).toBe('Cable');
      expect(data.sortOrder).toBe(0);
      expect(
        prismaMock.categorySpecification.findUnique,
      ).not.toHaveBeenCalled();
    });

    it('rejects supplying both specId and label', async () => {
      await expect(
        service.create(CATALOG_ID, {
          specId: SPEC_ID,
          label: 'RAM',
          value: '16 GB',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects supplying neither', async () => {
      await expect(
        service.create(CATALOG_ID, { value: '16 GB' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create failures', () => {
    it('404s on a missing catalog entry', async () => {
      prismaMock.productCatalog.findUnique.mockResolvedValue(null);

      await expect(
        service.create(CATALOG_ID, { specId: SPEC_ID, value: '16 GB' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a unique clash to ConflictException', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue(definition);
      prismaMock.productSpecification.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create(CATALOG_ID, { specId: SPEC_ID, value: '16 GB' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('refuses to rename a row backed by a definition', async () => {
      prismaMock.productSpecification.findUnique.mockResolvedValue({
        id: ROW_ID,
        specId: SPEC_ID,
      });

      await expect(
        service.update(ROW_ID, { label: 'Memory' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.productSpecification.update).not.toHaveBeenCalled();
    });

    it('allows renaming a free-text row', async () => {
      prismaMock.productSpecification.findUnique.mockResolvedValue({
        id: ROW_ID,
        specId: null,
      });
      prismaMock.productSpecification.update.mockResolvedValue({});

      await service.update(ROW_ID, { label: 'Memory' });

      expect(
        prismaMock.productSpecification.update.mock.calls[0][0].data.label,
      ).toBe('Memory');
    });

    it('always allows editing the value', async () => {
      prismaMock.productSpecification.findUnique.mockResolvedValue({
        id: ROW_ID,
        specId: SPEC_ID,
      });
      prismaMock.productSpecification.update.mockResolvedValue({});

      await service.update(ROW_ID, { value: '32 GB' });

      expect(
        prismaMock.productSpecification.update.mock.calls[0][0].data.value,
      ).toBe('32 GB');
    });
  });
});
