import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { buildMeta } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { JeeblyService } from '../../integrations/jeebly/jeebly.service';
import { ShipmentDataService, shipmentInclude } from './shipment-data.service';
import { AttachPackPhotoDto } from './dto/attach-pack-photo.dto';
import { QueryVendorOrdersDto } from './dto/query-vendor-orders.dto';
import { RecordPackageWeightDto } from './dto/record-package-weight.dto';

/**
 * Vendor-facing sub-order fulfillment. A SubOrder is one vendor's slice of a
 * customer Order (one item to pack, ship and get paid for). This service lists
 * the sub-orders that belong to the authenticated vendor, with status-tab
 * filtering and pagination, shaping each row for the order-list UI.
 */
@Injectable()
export class VendorOrdersService {
  private readonly logger = new Logger(VendorOrdersService.name);
  private static readonly listInclude = {
    product: {
      include: {
        catalog: {
          include: {
            brand: { select: { id: true, name: true, logoUrl: true } },
          },
        },
      },
    },
  } satisfies Prisma.SubOrderInclude;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jeebly: JeeblyService,
    private readonly shipmentData: ShipmentDataService,
  ) {}

  private async getVendorId(userId: string): Promise<string> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor.id;
  }

  async findAll(userId: string, query: QueryVendorOrdersDto) {
    const vendorId = await this.getVendorId(userId);

    const where: Prisma.SubOrderWhereInput = { vendorId };
    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }
    if (query.search) {
      const q = query.search;
      where.OR = [
        { subOrderNumber: { contains: q, mode: 'insensitive' } },
        {
          product: {
            is: {
              catalog: { is: { model: { contains: q, mode: 'insensitive' } } },
            },
          },
        },
        {
          product: {
            is: {
              catalog: {
                is: {
                  brand: { is: { name: { contains: q, mode: 'insensitive' } } },
                },
              },
            },
          },
        },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.subOrder.count({ where }),
      this.prisma.subOrder.findMany({
        where,
        include: VendorOrdersService.listInclude,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
    ]);

    return {
      items: rows.map((row) => this.toListItem(row)),
      meta: buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * Start packing a sub-order: `confirmed` → `preparing`.
   * Vendor "Start Packing" CTA on the new-order screen.
   */
  async startPacking(userId: string, subOrderId: string) {
    const vendorId = await this.getVendorId(userId);

    const subOrder = await this.prisma.subOrder.findFirst({
      where: { id: subOrderId, vendorId },
      select: { status: true },
    });
    if (!subOrder) {
      throw new NotFoundException('Sub-order not found');
    }
    if (subOrder.status !== OrderStatus.confirmed) {
      throw new ConflictException(
        'Only confirmed sub-orders can start packing',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Keep the state in the update predicate so two simultaneous requests
      // cannot both transition the order and append duplicate history rows.
      const result = await tx.subOrder.updateMany({
        where: {
          id: subOrderId,
          vendorId,
          status: OrderStatus.confirmed,
        },
        data: { status: OrderStatus.preparing },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Only confirmed sub-orders can start packing',
        );
      }

      await tx.subOrderStatusHistory.create({
        data: {
          subOrderId,
          status: OrderStatus.preparing,
          actorId: userId,
          note: 'Vendor started packing',
        },
      });

      const updated = await tx.subOrder.findUniqueOrThrow({
        where: { id: subOrderId },
        include: VendorOrdersService.listInclude,
      });
      return this.toListItem(updated);
    });
  }

  /**
   * Current packing-photo state for a sub-order (powers the packing-photos
   * screen on load: which of the 2 photos are uploaded).
   */
  async getPackPhotos(userId: string, subOrderId: string) {
    const vendorId = await this.getVendorId(userId);
    const subOrder = await this.getOwnedSubOrder(vendorId, subOrderId);
    return this.buildPackPhotosState(subOrder);
  }

  /**
   * Attach one packing photo (before/after) to a sub-order. Only allowed while
   * the order is `preparing` (i.e. after "Start Packing"). Once both photos
   * exist, `photosVerifiedAt` is stamped — the gate the "Mark as Ready for
   * Pickup" action checks.
   */
  async attachPackPhoto(
    userId: string,
    subOrderId: string,
    dto: AttachPackPhotoDto,
  ) {
    const vendorId = await this.getVendorId(userId);
    const subOrder = await this.getOwnedSubOrder(vendorId, subOrderId);

    if (subOrder.status !== OrderStatus.preparing) {
      throw new ConflictException(
        subOrder.status === OrderStatus.confirmed
          ? 'Start packing before uploading photos'
          : `Cannot upload packing photos while the order is "${subOrder.status}"`,
      );
    }

    // At least one photo key must be supplied. Both may be sent in one call.
    if (!dto.beforeKey && !dto.afterKey) {
      throw new BadRequestException(
        'Provide at least one of beforeKey or afterKey',
      );
    }

    // Apply whichever keys were sent, keeping any already-stored photo.
    const data: Prisma.SubOrderUpdateInput = {};
    if (dto.beforeKey) data.packPhotoBeforeUrl = dto.beforeKey;
    if (dto.afterKey) data.packPhotoAfterUrl = dto.afterKey;

    const beforeUrl = dto.beforeKey ?? subOrder.packPhotoBeforeUrl;
    const afterUrl = dto.afterKey ?? subOrder.packPhotoAfterUrl;
    const bothUploaded = !!beforeUrl && !!afterUrl;
    data.photosVerifiedAt = bothUploaded ? new Date() : null;

    const uploaded = [dto.beforeKey && 'before', dto.afterKey && 'after']
      .filter(Boolean)
      .join(' + ');

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.subOrder.update({
        where: { id: subOrderId },
        data,
      });
      await tx.subOrderStatusHistory.create({
        data: {
          subOrderId,
          status: OrderStatus.preparing,
          actorId: userId,
          note: `${uploaded} packing photo(s) uploaded`,
        },
      });
      return u;
    });

    return this.buildPackPhotosState(updated);
  }

  /**
   * Record the measured weight of the packed parcel, in kg. Allowed only while
   * the order is `preparing` and before a shipment attempt has been claimed, so
   * the weight sent to the courier is always the one stored here.
   */
  async recordPackageWeight(
    userId: string,
    subOrderId: string,
    dto: RecordPackageWeightDto,
  ) {
    const vendorId = await this.getVendorId(userId);
    const subOrder = await this.prisma.subOrder.findFirst({
      where: { id: subOrderId, vendorId },
      include: { shipmentCreation: true },
    });
    if (!subOrder) {
      throw new NotFoundException('Sub-order not found');
    }
    if (subOrder.status !== OrderStatus.preparing) {
      throw new ConflictException(
        subOrder.status === OrderStatus.confirmed
          ? 'Start packing before recording the package weight'
          : `Cannot record package weight while the order is "${subOrder.status}"`,
      );
    }
    if (subOrder.awbNumber !== null || subOrder.shipmentCreation) {
      throw new ConflictException(
        'Shipment creation has already started; the package weight can no longer be changed',
      );
    }

    const packageWeightKg = new Prisma.Decimal(dto.weightKg).toDecimalPlaces(3);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Requiring no claim in the predicate is what stops a weight edit from
      // landing after a concurrent request has reserved the courier booking.
      const result = await tx.subOrder.updateMany({
        where: {
          id: subOrderId,
          vendorId,
          status: OrderStatus.preparing,
          awbNumber: null,
          shipmentCreation: { is: null },
        },
        data: { packageWeightKg },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          'Package weight can no longer be changed for this order',
        );
      }
      await tx.subOrderStatusHistory.create({
        data: {
          subOrderId,
          status: OrderStatus.preparing,
          actorId: userId,
          note: `Package weight recorded: ${packageWeightKg.toFixed(3)} kg`,
        },
      });
      return tx.subOrder.findUniqueOrThrow({ where: { id: subOrderId } });
    });
    return this.buildPackPhotosState(updated);
  }

  /** Loads a sub-order and asserts it belongs to this vendor (404 otherwise). */
  private async getOwnedSubOrder(vendorId: string, subOrderId: string) {
    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
    });
    if (!subOrder || subOrder.vendorId !== vendorId) {
      throw new NotFoundException('Sub-order not found');
    }
    return subOrder;
  }

  /** Shapes the packing photos, recorded weight and progress for the UI. */
  private buildPackPhotosState(so: {
    subOrderNumber: string;
    status: OrderStatus;
    packPhotoBeforeUrl: string | null;
    packPhotoAfterUrl: string | null;
    photosVerifiedAt: Date | null;
    packageWeightKg: Prisma.Decimal | null;
  }) {
    const before = so.packPhotoBeforeUrl
      ? { key: so.packPhotoBeforeUrl }
      : null;
    const after = so.packPhotoAfterUrl ? { key: so.packPhotoAfterUrl } : null;
    const uploaded = (before ? 1 : 0) + (after ? 1 : 0);
    const packageWeightKg =
      so.packageWeightKg == null ? null : Number(so.packageWeightKg);

    // What the UI's primary CTA should do next.
    let nextAction:
      | 'upload_before'
      | 'upload_after'
      | 'record_weight'
      | 'ready_for_pickup';
    if (!before) {
      nextAction = 'upload_before';
    } else if (!after) {
      nextAction = 'upload_after';
    } else if (packageWeightKg === null) {
      nextAction = 'record_weight';
    } else {
      nextAction = 'ready_for_pickup';
    }

    return {
      subOrderNumber: so.subOrderNumber,
      status: so.status,
      required: 2,
      uploaded,
      complete: so.photosVerifiedAt != null,
      photos: { before, after },
      packageWeightKg,
      nextAction,
    };
  }

  /** Compact row for the vendor order-list screen. */
  private toListItem(
    row: Prisma.SubOrderGetPayload<{
      include: typeof VendorOrdersService.listInclude;
    }>,
  ) {
    const { product } = row;
    const catalog = product.catalog;
    return {
      id: row.id,
      subOrderNumber: row.subOrderNumber,
      status: row.status,
      createdAt: row.createdAt,
      deliveredAt: row.deliveredAt,
      courierName: row.courierName,
      awbNumber: row.awbNumber,
      item: {
        productId: product.id,
        title: `${catalog.brand.name} ${catalog.model}`.trim(),
        brand: catalog.brand.name,
        model: catalog.model,
        conditionGrade: product.conditionGrade,
        storageVariant: product.storageVariant,
        color: product.color,
        imageUrl:
          product.inspectionImages?.[0] ?? catalog.stockImageUrl ?? null,
      },
      payout: {
        salePrice: row.salePrice,
        payoutAmount: row.payoutAmount,
        payoutStatus: row.payoutStatus,
      },
    };
  }

  async readyForPickup(userId: string, subOrderId: string) {
    const vendorId = await this.getVendorId(userId);
    const subOrder = await this.prisma.subOrder.findFirst({
      where: { id: subOrderId, vendorId },
      include: shipmentInclude,
    });

    if (!subOrder) {
      throw new NotFoundException('Sub-order not found');
    }

    if (subOrder.awbNumber !== null) {
      throw new ConflictException(
        'Shipment has already been created for this sub-order',
      );
    }

    if (subOrder.status !== OrderStatus.preparing) {
      throw new ConflictException(
        `Cannot mark ready while order is "${subOrder.status}"`,
      );
    }

    if (!subOrder.packPhotoBeforeUrl || !subOrder.packPhotoAfterUrl) {
      throw new ConflictException(
        'Upload both packing photos before marking ready for pickup',
      );
    }

    if (subOrder.shipmentCreation) {
      if (subOrder.shipmentCreation.awbNumber) {
        // A previous call reached Jeebly but failed to commit the local state.
        // Retry ONLY the local transaction, using the durably recorded AWB.
        return this.completeShipment(
          userId,
          vendorId,
          subOrderId,
          subOrder.shipmentCreation.awbNumber,
        );
      }
      throw this.shipmentReconciliationConflict();
    }

    // Validate the stored facts and the whole mapping BEFORE claiming, so a
    // 422 never leaves a claim behind for an operator to reconcile.
    this.shipmentData.buildPayload(subOrder);
    this.jeebly.assertConfigured();

    // The primary key arbitrates across processes, with no expiring lock.
    // This standalone write commits before the external request begins.
    try {
      await this.prisma.shipmentCreation.create({ data: { subOrderId } });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.shipmentReconciliationConflict();
      }
      throw new ServiceUnavailableException(
        'Unable to reserve shipment creation; no Jeebly call was made',
      );
    }

    // Re-read under the committed claim and map from that. The weight endpoint
    // refuses once a claim exists, so this is the state the vendor last saw and
    // no edit can slip in between validation and the provider call.
    const claimed = await this.prisma.subOrder.findFirst({
      where: { id: subOrderId, vendorId },
      include: shipmentInclude,
    });
    if (!claimed) {
      throw new NotFoundException('Sub-order not found');
    }
    const payload = this.shipmentData.buildPayload(claimed);

    // Never release the claim automatically on provider failure: even a
    // timeout/invalid response can follow successful provider-side creation.
    const shipment = await this.jeebly.createShipment(payload);
    try {
      // Independent of the status/history transaction so its rollback cannot
      // erase the AWB needed by the next request to recover locally.
      await this.prisma.shipmentCreation.update({
        where: { subOrderId },
        data: { awbNumber: shipment.awbNumber },
      });
    } catch {
      // Only reconciliation identifiers; no payload, headers or raw errors.
      this.logger.error(
        JSON.stringify({
          code: 'JEEBLY_AWB_PERSIST_FAILED',
          subOrderNumber: subOrder.subOrderNumber,
          customer_reference_number: payload.customer_reference_number,
          awbNumber: shipment.awbNumber,
        }),
      );
      throw new ServiceUnavailableException({
        code: 'SHIPMENT_RECONCILIATION_REQUIRED',
        message:
          'Jeebly created the shipment but its AWB could not be saved. Contact support; do not create another shipment.',
      });
    }

    return this.completeShipment(
      userId,
      vendorId,
      subOrderId,
      shipment.awbNumber,
    );
  }

  private shipmentReconciliationConflict() {
    return new ConflictException({
      code: 'SHIPMENT_RECONCILIATION_REQUIRED',
      message:
        'Shipment creation is in progress or requires reconciliation. Do not create another shipment.',
    });
  }

  private async completeShipment(
    userId: string,
    vendorId: string,
    subOrderId: string,
    awbNumber: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const res = await tx.subOrder.updateMany({
          where: {
            id: subOrderId,
            vendorId,
            status: OrderStatus.preparing,
            awbNumber: null,
            packPhotoBeforeUrl: { not: null },
            packPhotoAfterUrl: { not: null },
            NOT: [{ packPhotoBeforeUrl: '' }, { packPhotoAfterUrl: '' }],
          },
          data: { status: OrderStatus.ready, courierName: 'Jeebly', awbNumber },
        });

        if (res.count !== 1) {
          throw new ConflictException('Order is no longer ready to transition');
        }

        await tx.subOrderStatusHistory.create({
          data: {
            subOrderId,
            status: OrderStatus.ready,
            actorId: userId,
            note: `Marked ready for pickup. Jeebly AWB: ${awbNumber}`,
          },
        });
        return tx.subOrder.findUniqueOrThrow({ where: { id: subOrderId } });
      });
    } catch (error: unknown) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(
        JSON.stringify({
          code: 'JEEBLY_LOCAL_COMMIT_FAILED',
          subOrderId,
          awbNumber,
        }),
      );
      throw new ServiceUnavailableException({
        code: 'SHIPMENT_LOCAL_UPDATE_FAILED',
        message:
          'Shipment AWB is saved, but the order update failed. Retry to complete the local update without creating another shipment.',
      });
    }
  }

  /** The vendor's 5 most recent sub-orders, shaped for the dashboard. */
  async recentOrders(userId: string) {
    const vendorId = await this.getVendorId(userId);
    const rows = await this.prisma.subOrder.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: VendorOrdersService.listInclude,
    });
    return rows.map((row) => this.toListItem(row));
  }
}
