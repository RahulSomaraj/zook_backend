import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, VendorStatus } from '@prisma/client';
import { AuthUser } from '../auth/jwt.strategy';
import { Role } from '../common/enums/role.enum';
import { PrismaService } from '../database/prisma.service';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submit (or resubmit) a vendor application + KYC documents.
   * Ensures the user row exists, creates the vendor on first apply, and always
   * creates a fresh KYC record (resubmission keeps history). A vendor with an
   * already-pending KYC submission cannot submit again until it is reviewed.
   */
  async apply(user: AuthUser, dto: ApplyVendorDto) {
    await this.prisma.user.upsert({
      where: { id: user.id },
      update: { role: Role.VENDOR },
      create: {
        id: user.id,
        email: user.email ?? `${user.id}@placeholder.zook`,
        role: Role.VENDOR,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.upsert({
        where: { userId: user.id },
        update: {
          storeName: dto.storeName,
          storeLogoUrl: dto.storeLogoUrl,
          storeAddress: dto.storeAddress,
          pickupLat: dto.pickupLat,
          pickupLng: dto.pickupLng,
        },
        create: {
          userId: user.id,
          storeName: dto.storeName,
          storeLogoUrl: dto.storeLogoUrl,
          storeAddress: dto.storeAddress,
          pickupLat: dto.pickupLat,
          pickupLng: dto.pickupLng,
        },
      });

      const pending = await tx.vendorKyc.findFirst({
        where: { vendorId: vendor.id, status: KycStatus.pending },
      });
      if (pending) {
        throw new BadRequestException(
          'A KYC submission is already pending review',
        );
      }

      const kyc = await tx.vendorKyc.create({
        data: {
          vendorId: vendor.id,
          tradeLicenseUrl: dto.tradeLicenseUrl,
          tradeLicenseNumber: dto.tradeLicenseNumber,
          tradeLicenseExpiry: new Date(dto.tradeLicenseExpiry),
          emiratesIdFrontUrl: dto.emiratesIdFrontUrl,
          emiratesIdBackUrl: dto.emiratesIdBackUrl,
        },
      });

      return { vendorId: vendor.id, kycId: kyc.id, status: vendor.status };
    });
  }

  /** Current approval status for the logged-in vendor. */
  async getStatus(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        kyc: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            rejectionReason: true,
            reviewedAt: true,
          },
        },
      },
    });
    if (!vendor) throw new NotFoundException('No vendor application found');
    return {
      vendorId: vendor.id,
      vendorStatus: vendor.status,
      latestKyc: vendor.kyc[0] ?? null,
    };
  }

  async getProfile(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }

  async updateProfile(userId: string, dto: UpdateVendorDto) {
    await this.getProfile(userId); // 404 if missing
    return this.prisma.vendor.update({
      where: { userId },
      data: dto,
    });
  }

  /** Guard helper: resolve the vendor row for an authenticated vendor user. */
  async requireApprovedVendor(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    if (vendor.status !== VendorStatus.approved) {
      throw new BadRequestException(
        'Vendor is not approved — cannot perform this action',
      );
    }
    return vendor;
  }
}
