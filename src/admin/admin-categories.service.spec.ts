import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AdminCategoriesService } from './admin-categories.service';
import { ListCategoryQueryDto } from './dto/list-category.dto';

const prismaMock = {
  category: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const CATEGORY_ID = '33333333-3333-3333-3333-333333333333';
const baseCategory = {
  id: CATEGORY_ID,
  name: 'Smartphones',
  slug: 'smartphones',
  icon: '📱',
  isActive: true,
  sortOrder: 0,
  createdAt: new Date(),
  deletedAt: null as Date | null,
};

function listQuery(overrides: Partial<ListCategoryQueryDto> = {}): ListCategoryQueryDto {
  return Object.assign(new ListCategoryQueryDto(), { page: 1, limit: 20, ...overrides });
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('AdminCategoriesService', () => {
  let service: AdminCategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCategoriesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(AdminCategoriesService);
  });

  describe('list', () => {
    it('hides archived and applies isActive + search', async () => {
      prismaMock.category.count.mockResolvedValue(1);
      prismaMock.category.findMany.mockResolvedValue([baseCategory]);

      await service.list(listQuery({ isActive: false, search: 'phone' }));

      const where = prismaMock.category.findMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
      expect(where.isActive).toBe(false);
      expect(where.name).toEqual({ contains: 'phone', mode: 'insensitive' });
    });
  });

  describe('create', () => {
    it('derives slug from name and keeps icon', async () => {
      prismaMock.category.create.mockResolvedValue(baseCategory);
      await service.create({ name: 'Gaming Consoles', icon: '🎮' });
      const data = prismaMock.category.create.mock.calls[0][0].data;
      expect(data.slug).toBe('gaming-consoles');
      expect(data.icon).toBe('🎮');
    });

    it('maps unique clash to ConflictException', async () => {
      prismaMock.category.create.mockRejectedValue(uniqueViolation());
      await expect(service.create({ name: 'Smartphones' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('getById', () => {
    it('throws NotFound when missing', async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);
      await expect(service.getById(CATEGORY_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('softDelete / restore', () => {
    it('archives an active category', async () => {
      prismaMock.category.findUnique.mockResolvedValue(baseCategory);
      prismaMock.category.update.mockResolvedValue(baseCategory);
      const result = await service.softDelete(CATEGORY_ID);
      expect(prismaMock.category.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(result).toEqual({ id: CATEGORY_ID, deleted: true });
    });

    it('rejects restoring a non-archived category', async () => {
      prismaMock.category.findUnique.mockResolvedValue(baseCategory);
      await expect(service.restore(CATEGORY_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
