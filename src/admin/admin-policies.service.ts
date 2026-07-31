import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { ListPolicyQueryDto } from './dto/list-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

/**
 * Policy administration. Deletes are soft (archive + restore). Every mutation
 * stamps the acting admin's user id onto the audit columns
 * (createdBy / updatedBy / deletedBy).
 */
@Injectable()
export class AdminPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPolicyQueryDto) {
    const where: Prisma.PolicyWhereInput = {};
    if (!query.includeDeleted) where.deletedAt = null;
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.policy.count({ where }),
      this.prisma.policy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
    ]);

    return { items, meta: buildMeta(total, query.page, query.limit) };
  }

  async getById(id: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  async create(userId: string, dto: CreatePolicyDto) {
    return this.prisma.policy.create({
      data: {
        type: dto.type,
        body: dto.body,
        isActive: dto.isActive ?? true,
        createdBy: userId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdatePolicyDto) {
    await this.getActiveOrThrow(id);
    return this.prisma.policy.update({
      where: { id },
      data: {
        type: dto.type,
        body: dto.body,
        isActive: dto.isActive,
        updatedBy: userId,
      },
    });
  }

  async softDelete(userId: string, id: string) {
    await this.getActiveOrThrow(id);
    await this.prisma.policy.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { id, deleted: true };
  }

  async restore(userId: string, id: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    if (!policy.deletedAt) throw new ConflictException('Policy is not archived');
    await this.prisma.policy.update({
      where: { id },
      data: { deletedAt: null, deletedBy: null, updatedBy: userId },
    });
    return { id, restored: true };
  }

  private async getActiveOrThrow(id: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    if (policy.deletedAt) {
      throw new ConflictException('Policy is archived; restore it first');
    }
    return policy;
  }
}
