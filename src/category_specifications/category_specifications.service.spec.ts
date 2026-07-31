import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CategorySpecificationsService } from './category_specifications.service';
import { ListCategorySpecificationQueryDto } from './dto/list-category_specification.dto';

const prismaMock = {
  categorySpecification: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  category: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const SPEC_ID = '44444444-4444-4444-4444-444444444444';

const baseSpec = {
  id: SPEC_ID,
  categoryId: CATEGORY_ID,
  label: 'RAM',
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null as Date | null,
  createdBy: ADMIN_ID,
  updatedBy: ADMIN_ID,
  deletedBy: null as string | null,
};

function listQuery(
  overrides: Partial<ListCategorySpecificationQueryDto> = {},
): ListCategorySpecificationQueryDto {
  return Object.assign(new ListCategorySpecificationQueryDto(), {
    page: 1,
    limit: 20,
    ...overrides,
  });
}

describe('CategorySpecificationsService', () => {
  let service: CategorySpecificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CategorySpecificationsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(CategorySpecificationsService);
  });

  describe('list', () => {
    it('hides archived and scopes to a category', async () => {
      prismaMock.categorySpecification.count.mockResolvedValue(1);
      prismaMock.categorySpecification.findMany.mockResolvedValue([baseSpec]);

      await service.list(listQuery({ categoryId: CATEGORY_ID, search: 'ra' }));

      const call = prismaMock.categorySpecification.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.categoryId).toBe(CATEGORY_ID);
      expect(call.where.label).toEqual({ contains: 'ra', mode: 'insensitive' });
      expect(call.orderBy).toEqual([{ sortOrder: 'asc' }, { label: 'asc' }]);
    });
  });

  describe('create', () => {
    it('stamps the acting admin and appends the field to the form', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
      prismaMock.categorySpecification.findUnique.mockResolvedValue(null);
      prismaMock.categorySpecification.count.mockResolvedValue(3);
      prismaMock.categorySpecification.create.mockResolvedValue(baseSpec);

      await service.create(ADMIN_ID, { categoryId: CATEGORY_ID, label: 'RAM' });

      const data =
        prismaMock.categorySpecification.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        categoryId: CATEGORY_ID,
        label: 'RAM',
        sortOrder: 3, // three live fields already, so this one lands last
        isActive: true,
        createdBy: ADMIN_ID,
        updatedBy: ADMIN_ID,
      });
      // Archived fields must not shift the position of new ones.
      expect(
        prismaMock.categorySpecification.count.mock.calls[0][0].where,
      ).toEqual({ categoryId: CATEGORY_ID, deletedAt: null });
    });

    it('rejects a seventh live field for the category', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
      prismaMock.categorySpecification.findUnique.mockResolvedValue(null);
      prismaMock.categorySpecification.count.mockResolvedValue(6);

      await expect(
        service.create(ADMIN_ID, { categoryId: CATEGORY_ID, label: 'RAM' }),
      ).rejects.toThrow(/maximum of 6/);
      expect(prismaMock.categorySpecification.create).not.toHaveBeenCalled();
    });

    it('allows the sixth field', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
      prismaMock.categorySpecification.findUnique.mockResolvedValue(null);
      prismaMock.categorySpecification.count.mockResolvedValue(5);
      prismaMock.categorySpecification.create.mockResolvedValue(baseSpec);

      await service.create(ADMIN_ID, { categoryId: CATEGORY_ID, label: 'RAM' });

      expect(prismaMock.categorySpecification.create).toHaveBeenCalled();
    });

    it('keeps an explicit sortOrder, including 0', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
      prismaMock.categorySpecification.findUnique.mockResolvedValue(null);
      prismaMock.categorySpecification.count.mockResolvedValue(3);
      prismaMock.categorySpecification.create.mockResolvedValue(baseSpec);

      await service.create(ADMIN_ID, {
        categoryId: CATEGORY_ID,
        label: 'RAM',
        sortOrder: 0,
      });

      expect(
        prismaMock.categorySpecification.create.mock.calls[0][0].data.sortOrder,
      ).toBe(0);
    });

    it('throws NotFound when the category does not exist', async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create(ADMIN_ID, { categoryId: CATEGORY_ID, label: 'RAM' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('points at the archived row when the label is taken by one', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
      prismaMock.categorySpecification.findUnique.mockResolvedValue({
        deletedAt: new Date(),
      });

      await expect(
        service.create(ADMIN_ID, { categoryId: CATEGORY_ID, label: 'RAM' }),
      ).rejects.toThrow(/archived/);
      expect(prismaMock.categorySpecification.create).not.toHaveBeenCalled();
    });

    it('maps a concurrent unique clash to ConflictException', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
      prismaMock.categorySpecification.findUnique.mockResolvedValue(null);
      prismaMock.categorySpecification.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create(ADMIN_ID, { categoryId: CATEGORY_ID, label: 'RAM' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('skips the label check when the label is unchanged', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue(baseSpec);
      prismaMock.categorySpecification.update.mockResolvedValue(baseSpec);

      await service.update(ADMIN_ID, SPEC_ID, { label: 'RAM', sortOrder: 2 });

      // Only the getActiveOrThrow lookup — no duplicate-label probe.
      expect(prismaMock.categorySpecification.findUnique).toHaveBeenCalledTimes(
        1,
      );
      expect(
        prismaMock.categorySpecification.update.mock.calls[0][0].data.updatedBy,
      ).toBe(ADMIN_ID);
    });

    it('rejects updating an archived specification', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue({
        ...baseSpec,
        deletedAt: new Date(),
      });

      await expect(
        service.update(ADMIN_ID, SPEC_ID, { sortOrder: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('softDelete / restore', () => {
    it('archives an active specification', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue(baseSpec);
      prismaMock.categorySpecification.update.mockResolvedValue(baseSpec);

      const result = await service.softDelete(ADMIN_ID, SPEC_ID);

      const data =
        prismaMock.categorySpecification.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.deletedBy).toBe(ADMIN_ID);
      expect(result).toEqual({ id: SPEC_ID, deleted: true });
    });

    it('rejects restoring a non-archived specification', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue(baseSpec);

      await expect(service.restore(ADMIN_ID, SPEC_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('clears the archive columns on restore', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue({
        ...baseSpec,
        deletedAt: new Date(),
        deletedBy: ADMIN_ID,
      });
      prismaMock.categorySpecification.update.mockResolvedValue(baseSpec);

      const result = await service.restore(ADMIN_ID, SPEC_ID);

      expect(
        prismaMock.categorySpecification.update.mock.calls[0][0].data,
      ).toEqual({ deletedAt: null, deletedBy: null, updatedBy: ADMIN_ID });
      expect(result).toEqual({ id: SPEC_ID, restored: true });
    });
  });

  describe('getById', () => {
    it('throws NotFound when missing', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue(null);
      await expect(service.getById(SPEC_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('response shape', () => {
    it('flattens _count and drops columns not in the contract', async () => {
      prismaMock.categorySpecification.findUnique.mockResolvedValue({
        ...baseSpec,
        _count: { values: 7 },
        // A column added to the model later must not leak through the mapper.
        internalNote: 'should not be exposed',
      });

      const spec: any = await service.getById(SPEC_ID);

      expect(spec.valueCount).toBe(7);
      expect(spec).not.toHaveProperty('_count');
      expect(spec).not.toHaveProperty('internalNote');
      expect(Object.keys(spec).sort()).toEqual([
        'categoryId',
        'createdAt',
        'createdBy',
        'deletedAt',
        'deletedBy',
        'id',
        'isActive',
        'label',
        'sortOrder',
        'updatedAt',
        'updatedBy',
        'valueCount',
      ]);
    });

    it('omits valueCount when the relation was not loaded', async () => {
      prismaMock.category.findUnique.mockResolvedValue({ deletedAt: null });
      prismaMock.categorySpecification.findUnique.mockResolvedValue(null);
      prismaMock.categorySpecification.count.mockResolvedValue(0);
      prismaMock.categorySpecification.create.mockResolvedValue(baseSpec);

      const spec: any = await service.create(ADMIN_ID, {
        categoryId: CATEGORY_ID,
        label: 'RAM',
      });

      expect(spec).not.toHaveProperty('valueCount');
      expect(spec.label).toBe('RAM');
    });

    it('maps every row in a list page', async () => {
      prismaMock.categorySpecification.count.mockResolvedValue(1);
      prismaMock.categorySpecification.findMany.mockResolvedValue([
        { ...baseSpec, _count: { values: 2 } },
      ]);

      const page: any = await service.list(listQuery());

      expect(page.items[0].valueCount).toBe(2);
      expect(page.items[0]).not.toHaveProperty('_count');
    });
  });
});
