import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, Prisma, VendorStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { normalizePhone } from '../common/utils/phone.util';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';

export type StepStatus = 'done' | 'active' | 'pending' | 'rejected';

const vendorProfileSelect = {
  id: true,
  userId: true,
  storeName: true,
  storeLogoUrl: true,
  description: true,
  phone: true,
  coverImageUrl: true,
  language: true,
  currency: true,
  storeAddress: true,
  pickupLat: true,
  pickupLng: true,
  commissionRate: true,
  status: true,
  strikeCount: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.VendorSelect;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vendor profile for the authenticated user (store + latest KYC). */
  async getMe(userId: string) {
    const vendor = await this.findVendorOrThrow(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true, phone: true },
    });
    const latestKyc = await this.prisma.vendorKyc.findFirst({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: vendor.id,
      storeName: vendor.storeName,
      description: vendor.description,
      coverImageUrl: vendor.coverImageUrl,
      status: vendor.status,
      commissionRate: vendor.commissionRate,
      storeAddress: vendor.storeAddress,
      pickupLat: vendor.pickupLat,
      pickupLng: vendor.pickupLng,
      ownerFullName: user?.fullName ?? null,
      ownerEmail: user?.email ?? null,
      phone: user?.phone ?? null,
      createdAt: vendor.createdAt,
      deletedAt: vendor.deletedAt,
      kyc: latestKyc
        ? { status: latestKyc.status, submittedAt: latestKyc.createdAt }
        : null,
    };
  }

  /** Submit (or resubmit) KYC documents; sets the vendor's KYC to pending. */
  async submitKyc(userId: string, dto: SubmitKycDto) {
    const vendor = await this.findVendorOrThrow(userId);

    const pending = await this.prisma.vendorKyc.findFirst({
      where: { vendorId: vendor.id, status: KycStatus.pending },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('A KYC submission is already under review');
    }

    const kyc = await this.prisma.vendorKyc.create({
      data: {
        vendorId: vendor.id,
        tradeLicenseNumber: dto.tradeLicenseNumber ?? null,
        tradeLicenseExpiry: dto.tradeLicenseExpiry
          ? new Date(dto.tradeLicenseExpiry)
          : null,
        tradeLicenseUrl: dto.tradeLicenseUrl,
        emiratesIdFrontUrl: dto.emiratesIdFrontUrl,
        emiratesIdBackUrl: dto.emiratesIdBackUrl,
      },
    });
    return { id: kyc.id, status: kyc.status, submittedAt: kyc.createdAt };
  }

  /** Soft-delete (close) the authenticated vendor's own account. */
  async deleteMe(userId: string) {
    const vendor = await this.findVendorOrThrow(userId);
    if (vendor.deletedAt) {
      throw new ConflictException('Vendor account is already closed');
    }
    await this.prisma.vendor.update({
      where: { id: vendor.id },
      data: { deletedAt: new Date() },
    });
    return { id: vendor.id, deleted: true };
  }

  /** The 4-step onboarding tracker shown in the KYC screens. */
  async onboardingStatus(userId: string) {
    const vendor = await this.findVendorOrThrow(userId);
    const kyc = await this.prisma.vendorKyc.findFirst({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
    });

    const kycStatus = kyc?.status ?? null;
    const approved = vendor.status === VendorStatus.approved;

    const documentsStatus: StepStatus = kyc ? 'done' : 'active';
    let reviewStatus: StepStatus = 'pending';
    if (kycStatus === KycStatus.pending) reviewStatus = 'active';
    else if (kycStatus === KycStatus.approved) reviewStatus = 'done';
    else if (kycStatus === KycStatus.rejected) reviewStatus = 'rejected';

    return {
      vendorStatus: vendor.status,
      kycStatus,
      submittedAt: kyc?.createdAt ?? null,
      reviewedAt: kyc?.reviewedAt ?? null,
      rejectionReason: kyc?.rejectionReason ?? null,
      steps: [
        {
          key: 'account',
          title: 'Account created',
          status: 'done' as StepStatus,
        },
        {
          key: 'documents',
          title: 'Documents submitted',
          status: documentsStatus,
        },
        { key: 'review', title: 'Admin review', status: reviewStatus },
        {
          key: 'approved',
          title: 'Store approved',
          status: (approved ? 'done' : 'pending') as StepStatus,
        },
      ],
    };
  }

  async updateProfile(userId: string, dto: UpdateVendorProfileDto) {
    const vendor = await this.findVendorOrThrow(userId);

    let normalizedPhone: string | undefined;
    if (dto.phone !== undefined) {
      normalizedPhone = normalizePhone(dto.phone);

      const existing = await this.prisma.user.findFirst({
        where: { phone: normalizedPhone, id: { not: userId } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('This phone number is already in use');
      }
    }

    const vendorData: Prisma.VendorUpdateInput = {
      ...(dto.storeName !== undefined ? { storeName: dto.storeName } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl } : {}),
      ...(dto.storeAddress !== undefined ? { storeAddress: dto.storeAddress } : {}),
      ...(dto.pickupLat !== undefined ? { pickupLat: dto.pickupLat } : {}),
      ...(dto.pickupLng !== undefined ? { pickupLng: dto.pickupLng } : {}),
    };

    await this.prisma.$transaction([
      this.prisma.vendor.update({
        where: { id: vendor.id },
        data: vendorData,
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(normalizedPhone !== undefined ? { phone: normalizedPhone } : {}),
        },
      }),
    ]);

    return this.getMe(userId);
  }

  private async findVendorOrThrow(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: vendorProfileSelect,
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }
}
