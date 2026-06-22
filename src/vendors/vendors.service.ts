import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, VendorStatus } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../database/prisma.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';

export type DocumentKind =
  | 'trade_license'
  | 'emirates_id_front'
  | 'emirates_id_back';

export type StepStatus = 'done' | 'active' | 'pending' | 'rejected';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Vendor profile for the authenticated user (store + latest KYC). */
  async getMe(userId: string) {
    const vendor = await this.findVendorOrThrow(userId);
    const latestKyc = await this.prisma.vendorKyc.findFirst({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: vendor.id,
      storeName: vendor.storeName,
      status: vendor.status,
      commissionRate: vendor.commissionRate,
      storeAddress: vendor.storeAddress,
      createdAt: vendor.createdAt,
      kyc: latestKyc
        ? { status: latestKyc.status, submittedAt: latestKyc.createdAt }
        : null,
    };
  }

  /** Upload a single KYC document and return the stored URL. */
  async uploadDocument(
    userId: string,
    kind: DocumentKind,
    file:
      | { buffer: Buffer; originalname: string; mimetype: string }
      | undefined,
  ): Promise<{ kind: DocumentKind; url: string }> {
    if (!file) throw new BadRequestException('No file uploaded');
    const vendor = await this.findVendorOrThrow(userId);
    const stored = await this.storage.save(file.buffer, {
      folder: `kyc/${vendor.id}/${kind}`,
      filename: file.originalname || kind,
      contentType: file.mimetype,
    });
    return { kind, url: stored.url };
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
        tradeLicenseNumber: dto.tradeLicenseNumber,
        tradeLicenseExpiry: new Date(dto.tradeLicenseExpiry),
        tradeLicenseUrl: dto.tradeLicenseUrl,
        emiratesIdFrontUrl: dto.emiratesIdFrontUrl,
        emiratesIdBackUrl: dto.emiratesIdBackUrl,
      },
    });
    return { id: kyc.id, status: kyc.status, submittedAt: kyc.createdAt };
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

  private async findVendorOrThrow(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }
}
