import { Injectable, NotFoundException } from '@nestjs/common';
import { PolicyType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

// Only expose buyer/vendor-safe fields — no audit columns (createdBy, etc.).
const publicSelect = {
  id: true,
  type: true,
  body: true,
  updatedAt: true,
} satisfies Prisma.PolicySelect;

/**
 * Public, read-only access to the active legal documents (Terms & Conditions,
 * Privacy Policy) for the customer/vendor apps.
 */
@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The current active document of a given type (latest active, non-deleted). */
  async getByType(type: PolicyType) {
    const policy = await this.prisma.policy.findFirst({
      where: { type, isActive: true, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: publicSelect,
    });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  /** All active documents (one or more per type), newest first. */
  async listActive() {
    return this.prisma.policy.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ type: 'asc' }, { updatedAt: 'desc' }],
      select: publicSelect,
    });
  }
}
