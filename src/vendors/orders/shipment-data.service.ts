import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Emirate, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import {
  normalizePhone,
  isPlausiblePhone,
} from '../../common/utils/phone.util';
import type { JeeblyCreateShipmentRequest } from '../../integrations/jeebly/jeebly.types';

export const shipmentInclude = {
  vendor: { include: { user: { select: { phone: true } }, country: true } },
  order: { include: { address: true } },
  product: { include: { catalog: { include: { brand: true } } } },
  shipmentCreation: true,
} satisfies Prisma.SubOrderInclude;

export type ShipmentSubOrder = Prisma.SubOrderGetPayload<{
  include: typeof shipmentInclude;
}>;

// Internal verified facts, never accepted from the ready-for-pickup request.
export interface VerifiedShipmentFacts {
  packageWeightKg: number;
  payment:
    | { kind: 'paid' }
    | { kind: 'cod'; amountToCollect: number; currency: 'AED' };
}

const emirateNames: Record<Emirate, string> = {
  abu_dhabi: 'Abu Dhabi',
  dubai: 'Dubai',
  sharjah: 'Sharjah',
  ajman: 'Ajman',
  umm_al_quwain: 'Umm Al Quwain',
  ras_al_khaimah: 'Ras Al Khaimah',
  fujairah: 'Fujairah',
};

function required(value: string | null | undefined, field: string): string {
  if (!value?.trim()) {
    throw new UnprocessableEntityException(`Missing shipment data: ${field}`);
  }
  return value.trim();
}

function uaePhone(value: string | null | undefined, field: string): string {
  const phone = normalizePhone(required(value, field));
  if (!phone.startsWith('+971') || !isPlausiblePhone(phone)) {
    throw new UnprocessableEntityException(
      `Invalid UAE mobile number: ${field}`,
    );
  }
  return phone.slice(4);
}

export function buildJeeblyPayload(
  subOrder: ShipmentSubOrder,
  facts: VerifiedShipmentFacts,
  now = new Date(),
): JeeblyCreateShipmentRequest {
  const { vendor, order, product } = subOrder;
  const address = order.address;
  if (!vendor?.pickupEmirate) {
    throw new UnprocessableEntityException('Missing vendor pickup emirate');
  }
  if (!address || address.userId !== order.customerId) {
    throw new UnprocessableEntityException(
      'Missing or invalid order shipping address',
    );
  }
  if (
    !['ae', 'uae', 'united arab emirates'].includes(
      address.country.trim().toLowerCase(),
    ) ||
    (vendor.country && vendor.country.iso2.toUpperCase() !== 'AE')
  ) {
    throw new UnprocessableEntityException(
      'Jeebly shipment mapping currently supports UAE addresses only',
    );
  }
  if (!Number.isFinite(facts.packageWeightKg) || facts.packageWeightKg <= 0) {
    throw new UnprocessableEntityException(
      'A measured positive package weight in kg is required',
    );
  }
  const payment = facts.payment;
  if (
    payment.kind !== 'paid' &&
    (payment.kind !== 'cod' ||
      payment.currency !== 'AED' ||
      !Number.isFinite(payment.amountToCollect) ||
      payment.amountToCollect <= 0)
  ) {
    throw new UnprocessableEntityException(
      'Verified paid status or an allocated COD amount in AED is required',
    );
  }
  return {
    delivery_type: 'Next Day',
    load_type: 'Non-document',
    consignment_type: 'Forward',
    description:
      `${product.catalog.brand.name} ${product.catalog.model}`.trim(),
    // Jeebly accepts whole kilograms only, and couriers bill on a rounded-up
    // parcel weight anyway. The vendor's measured value stays intact in the
    // database; only the chargeable figure sent to the courier is rounded.
    weight: Math.ceil(facts.packageWeightKg),
    payment_type: payment.kind === 'paid' ? 'Prepaid' : 'COD',
    cod_amount: payment.kind === 'cod' ? payment.amountToCollect : 0,
    num_pieces: 1,
    customer_reference_number: subOrder.subOrderNumber,
    origin_address_name: required(vendor.storeName, 'vendor store name'),
    origin_address_mob_no_country_code: '971',
    origin_address_mobile_number: uaePhone(
      vendor.phone ?? vendor.user.phone,
      'vendor phone',
    ),
    origin_address_house_no: required(
      vendor.pickupHouseNo,
      'vendor pickup house/unit number',
    ),
    // Preserve free-form addresses; do not invent structured house/building data.
    origin_address_building_name: required(
      vendor.storeAddress,
      'vendor pickup address',
    ),
    origin_address_area: required(vendor.pickupArea, 'vendor pickup area'),
    origin_address_landmark: required(
      vendor.pickupLandmark,
      'vendor pickup landmark',
    ),
    origin_address_city: emirateNames[vendor.pickupEmirate],
    origin_address_type: 'Normal',
    destination_address_name: required(address.fullName, 'shipping recipient'),
    destination_address_mob_no_country_code: '971',
    destination_address_mobile_number: uaePhone(
      address.phone,
      'shipping phone',
    ),
    destination_address_house_no: required(
      address.houseNo,
      'shipping house/flat number',
    ),
    destination_address_building_name: [
      required(address.line1, 'shipping address'),
      address.line2,
    ]
      .filter(Boolean)
      .join(', '),
    destination_address_area: required(address.area, 'shipping area'),
    destination_address_landmark: address.landmark ?? '',
    destination_address_city: required(address.city, 'shipping city'),
    // CustomerAddress.label is free-form, not a Jeebly address-type enum.
    destination_address_type: 'Normal',
    // Calendar date at pickup location, independent of the server timezone.
    pickup_date: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  };
}

/** Positive finite number from a stored Decimal, or null when absent/invalid. */
function positiveAmount(
  value: Prisma.Decimal | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const amount = new Prisma.Decimal(value).toNumber();
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

@Injectable()
export class ShipmentDataService {
  buildPayload(subOrder: ShipmentSubOrder): JeeblyCreateShipmentRequest {
    return buildJeeblyPayload(subOrder, this.getVerifiedFacts(subOrder));
  }

  /**
   * Resolves shipment facts from authoritative storage only: the package
   * weight the vendor recorded while packing, the order's server-written
   * payment status and the COD amount allocated to this sub-order at checkout.
   * paymentId, sub-order status, payout status and catalog specs prove none of
   * these; client input is never accepted here.
   */
  getVerifiedFacts(subOrder: ShipmentSubOrder): VerifiedShipmentFacts {
    const packageWeightKg = positiveAmount(subOrder.packageWeightKg);
    if (packageWeightKg === null) {
      throw new UnprocessableEntityException({
        code: 'SHIPMENT_WEIGHT_MISSING',
        message: `Shipment ${subOrder.subOrderNumber} cannot be created: record the measured package weight before marking ready for pickup.`,
      });
    }
    const { paymentMethod, paymentStatus } = subOrder.order;
    // A verified payment always ships prepaid, even on a COD order, so the
    // courier never collects money that was already paid.
    if (paymentStatus === PaymentStatus.paid) {
      return { packageWeightKg, payment: { kind: 'paid' } };
    }
    if (
      paymentMethod === PaymentMethod.cod &&
      paymentStatus === PaymentStatus.pending
    ) {
      const amountToCollect = positiveAmount(subOrder.codAmount);
      if (amountToCollect === null) {
        throw new UnprocessableEntityException({
          code: 'SHIPMENT_COD_AMOUNT_MISSING',
          message: `Shipment ${subOrder.subOrderNumber} cannot be created: no COD amount is allocated to this sub-order.`,
        });
      }
      return {
        packageWeightKg,
        payment: { kind: 'cod', amountToCollect, currency: 'AED' },
      };
    }
    throw new UnprocessableEntityException({
      code: 'SHIPMENT_PAYMENT_UNVERIFIED',
      message: `Shipment ${subOrder.subOrderNumber} cannot be created: order payment is "${paymentStatus}" (${paymentMethod}), not verified as paid.`,
    });
  }
}
