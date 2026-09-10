import { UnprocessableEntityException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import {
  buildJeeblyPayload,
  ShipmentDataService,
} from './shipment-data.service';
import type {
  ShipmentSubOrder,
  VerifiedShipmentFacts,
} from './shipment-data.service';

describe('Jeebly shipment data mapping', () => {
  let subOrder: ShipmentSubOrder;
  const paid: VerifiedShipmentFacts = {
    packageWeightKg: 1.25,
    payment: { kind: 'paid' },
  };

  beforeEach(() => {
    subOrder = {
      subOrderNumber: 'SUB-041',
      vendor: {
        storeName: 'Vendor Store',
        storeAddress: 'Shop 7, Vendor Tower',
        pickupArea: 'Al Barsha',
        pickupEmirate: 'dubai',
        pickupHouseNo: '7',
        pickupLandmark: 'Opposite Al Khail Mall',
        phone: '+971501234567',
        user: { phone: '+971509999999' },
        country: { iso2: 'AE' },
      },
      order: {
        customerId: 'customer-1',
        paymentId: 'not-proof-of-payment',
        address: {
          userId: 'customer-1',
          fullName: 'Shipping Recipient',
          phone: '+971551234567',
          houseNo: '42',
          line1: 'Apartment 42, Customer Tower',
          line2: 'Street 3',
          area: 'Al Nahda',
          city: 'Sharjah',
          country: 'UAE',
          landmark: 'Near the park',
          label: 'My favourite place',
        },
      },
      product: {
        catalog: { brand: { name: 'Apple' }, model: 'iPhone 14 Pro' },
      },
    } as ShipmentSubOrder;
  });

  it('uses the vendor pickup location and phone, never the platform address', () => {
    expect(buildJeeblyPayload(subOrder, paid)).toMatchObject({
      origin_address_name: 'Vendor Store',
      origin_address_building_name: 'Shop 7, Vendor Tower',
      origin_address_area: 'Al Barsha',
      origin_address_city: 'Dubai',
      origin_address_mob_no_country_code: '971',
      origin_address_mobile_number: '501234567',
    });
  });

  it('uses only the parent order shipping address and recipient', () => {
    expect(buildJeeblyPayload(subOrder, paid)).toMatchObject({
      destination_address_name: 'Shipping Recipient',
      destination_address_building_name:
        'Apartment 42, Customer Tower, Street 3',
      destination_address_city: 'Sharjah',
      destination_address_mob_no_country_code: '971',
      destination_address_mobile_number: '551234567',
      destination_address_landmark: 'Near the park',
      destination_address_type: 'Normal',
      destination_address_house_no: '42',
      destination_address_area: 'Al Nahda',
    });
  });

  it('maps verified paid orders to Prepaid, COD zero, and rounds weight up to whole kg', () => {
    expect(buildJeeblyPayload(subOrder, paid)).toMatchObject({
      payment_type: 'Prepaid',
      cod_amount: 0,
      weight: 2,
      num_pieces: 1,
      customer_reference_number: 'SUB-041',
      load_type: 'Non-document',
      consignment_type: 'Forward',
      delivery_type: 'Next Day',
      description: 'Apple iPhone 14 Pro',
    });
  });

  it('uses the verified per-shipment COD allocation instead of the parent total or vendor payout', () => {
    expect(
      buildJeeblyPayload(subOrder, {
        packageWeightKg: 2.3,
        payment: { kind: 'cod', amountToCollect: 345.67, currency: 'AED' },
      }),
    ).toMatchObject({ payment_type: 'COD', cod_amount: 345.67, weight: 3 });
  });

  it('uses the UAE calendar date across a UTC date boundary', () => {
    expect(
      buildJeeblyPayload(subOrder, paid, new Date('2026-09-07T21:00:00Z'))
        .pickup_date,
    ).toBe('2026-09-08');
  });

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid shipping weight %s',
    (packageWeightKg) => {
      expect(() =>
        buildJeeblyPayload(subOrder, { ...paid, packageWeightKg }),
      ).toThrow(UnprocessableEntityException);
    },
  );

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid COD amount %s',
    (amountToCollect) => {
      expect(() =>
        buildJeeblyPayload(subOrder, {
          ...paid,
          payment: { kind: 'cod', amountToCollect, currency: 'AED' },
        }),
      ).toThrow(UnprocessableEntityException);
    },
  );

  it('rejects absent or foreign-owned shipping addresses', () => {
    subOrder.order.address!.userId = 'someone-else';
    expect(() => buildJeeblyPayload(subOrder, paid)).toThrow(
      'Missing or invalid order shipping address',
    );
    subOrder.order.address = null;
    expect(() => buildJeeblyPayload(subOrder, paid)).toThrow(
      'Missing or invalid order shipping address',
    );
  });

  it('rejects missing pickup details', () => {
    subOrder.vendor!.storeAddress = null;
    expect(() => buildJeeblyPayload(subOrder, paid)).toThrow(
      'vendor pickup address',
    );
  });

  it.each([
    ['pickupHouseNo', 'vendor pickup house/unit number'],
    ['pickupLandmark', 'vendor pickup landmark'],
  ] as const)(
    'refuses to ship without the courier-required vendor %s',
    (field, message) => {
      subOrder.vendor![field] = null;
      expect(() => buildJeeblyPayload(subOrder, paid)).toThrow(message);
    },
  );

  it.each([
    ['houseNo', 'shipping house/flat number'],
    ['area', 'shipping area'],
  ] as const)(
    'refuses to ship without the courier-required delivery %s',
    (field, message) => {
      subOrder.order.address![field] = null;
      expect(() => buildJeeblyPayload(subOrder, paid)).toThrow(message);
    },
  );

  // Jeebly refuses a fractional weight, and couriers bill a rounded-up parcel.
  it.each([
    [0.001, 1],
    [0.45, 1],
    [1, 1],
    [1.01, 2],
    [2.3, 3],
    [30, 30],
  ])('sends %s kg to the courier as %s kg', (packageWeightKg, expected) => {
    expect(
      buildJeeblyPayload(subOrder, { ...paid, packageWeightKg }).weight,
    ).toBe(expected);
    expect(
      Number.isInteger(
        buildJeeblyPayload(subOrder, { ...paid, packageWeightKg }).weight,
      ),
    ).toBe(true);
  });

  it('never rounds a measured weight down to zero', () => {
    expect(
      buildJeeblyPayload(subOrder, { ...paid, packageWeightKg: 0.01 }).weight,
    ).toBe(1);
  });

  it('rejects international addresses and invalid mobile numbers', () => {
    subOrder.order.address!.country = 'India';
    expect(() => buildJeeblyPayload(subOrder, paid)).toThrow(
      'UAE addresses only',
    );
    subOrder.order.address!.country = 'AE';
    subOrder.order.address!.phone = '+919876543210';
    expect(() => buildJeeblyPayload(subOrder, paid)).toThrow(
      'Invalid UAE mobile',
    );
  });

  describe('verified facts resolved from stored columns', () => {
    interface Stored {
      weightKg?: string | null;
      codAmount?: string | null;
      paymentMethod?: PaymentMethod;
      paymentStatus?: PaymentStatus;
    }

    const rowWith = (stored: Stored): ShipmentSubOrder => ({
      ...subOrder,
      packageWeightKg:
        stored.weightKg === undefined
          ? new Prisma.Decimal('1.25')
          : stored.weightKg === null
            ? null
            : new Prisma.Decimal(stored.weightKg),
      codAmount:
        stored.codAmount == null ? null : new Prisma.Decimal(stored.codAmount),
      order: {
        ...subOrder.order,
        paymentMethod: stored.paymentMethod ?? PaymentMethod.prepaid,
        paymentStatus: stored.paymentStatus ?? PaymentStatus.pending,
      },
    });

    const resolve = (stored: Stored) =>
      new ShipmentDataService().getVerifiedFacts(rowWith(stored));

    const refusalCode = (stored: Stored): string => {
      try {
        resolve(stored);
      } catch (error) {
        const body = (error as UnprocessableEntityException).getResponse();
        return (body as { code: string }).code;
      }
      throw new Error('expected getVerifiedFacts to refuse');
    };

    it('ships a server-verified paid order as prepaid', () => {
      expect(resolve({ paymentStatus: PaymentStatus.paid })).toEqual({
        packageWeightKg: 1.25,
        payment: { kind: 'paid' },
      });
    });

    it('never collects again on a COD order that was already paid', () => {
      expect(
        resolve({
          paymentMethod: PaymentMethod.cod,
          paymentStatus: PaymentStatus.paid,
          codAmount: '345.67',
        }),
      ).toEqual({ packageWeightKg: 1.25, payment: { kind: 'paid' } });
    });

    it('collects the amount allocated to this sub-order, not the parent total or payout', () => {
      expect(
        resolve({
          paymentMethod: PaymentMethod.cod,
          paymentStatus: PaymentStatus.pending,
          codAmount: '345.67',
        }),
      ).toEqual({
        packageWeightKg: 1.25,
        payment: { kind: 'cod', amountToCollect: 345.67, currency: 'AED' },
      });
    });

    it('refuses a COD order with no allocated amount', () => {
      expect(
        refusalCode({
          paymentMethod: PaymentMethod.cod,
          paymentStatus: PaymentStatus.pending,
        }),
      ).toBe('SHIPMENT_COD_AMOUNT_MISSING');
    });

    it.each([
      [PaymentMethod.prepaid, PaymentStatus.pending],
      [PaymentMethod.prepaid, PaymentStatus.failed],
      [PaymentMethod.cod, PaymentStatus.failed],
    ])('refuses to ship %s order whose payment is %s', (method, status) => {
      expect(
        refusalCode({
          paymentMethod: method,
          paymentStatus: status,
          codAmount: '345.67',
        }),
      ).toBe('SHIPMENT_PAYMENT_UNVERIFIED');
    });

    it.each([null, '0', '-1'])(
      'refuses to ship without a positive recorded weight: %s',
      (weightKg) => {
        expect(
          refusalCode({ weightKg, paymentStatus: PaymentStatus.paid }),
        ).toBe('SHIPMENT_WEIGHT_MISSING');
      },
    );

    it('checks the weight before the payment so the vendor sees the actionable refusal first', () => {
      expect(refusalCode({ weightKg: null })).toBe('SHIPMENT_WEIGHT_MISSING');
    });

    it('maps a stored COD order end to end', () => {
      const data = new ShipmentDataService();
      expect(
        data.buildPayload(
          rowWith({
            weightKg: '2.3',
            paymentMethod: PaymentMethod.cod,
            paymentStatus: PaymentStatus.pending,
            codAmount: '345.67',
          }),
        ),
      ).toMatchObject({
        weight: 3,
        payment_type: 'COD',
        cod_amount: 345.67,
        customer_reference_number: 'SUB-041',
      });
    });
  });
});
