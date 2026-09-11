/**
 * ONE-OFF: makes a single existing cloud sub-order shippable so the Jeebly
 * integration can be exercised end to end against the DEMO courier API.
 *
 * Delete this file once you are done. It is not part of the app.
 *
 * It writes SYNTHETIC data. Every value below is a placeholder, clearly
 * labelled as such, and must be replaced with the vendor's and customer's real
 * details before anything ships for real. Guard rails below refuse to run
 * against a production-looking environment or against real Jeebly credentials.
 *
 * Run from the repo root:  node scripts/backfill-cloud-shipment-fixture.js
 */
const { PrismaClient } = require('@prisma/client');

const ORDER_ID = 'c123368f-715a-438a-893b-503505740fbd'; // ORD-LLK-148223
const CUSTOMER_ID = 'e6a7c077-c8d3-47b0-a6a3-098215774d9d';
const SUB_ORDER_ID = '9aa25c4b-06c9-44be-aa2e-820efa2cfa22'; // SUB-LLK-148223-4

// Refuse to touch anything that looks like production, and refuse to set up a
// booking that would hit the live courier rather than the demo endpoint.
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run against NODE_ENV=production.');
}
if ((process.env.JEEBLY_ENV ?? 'demo') !== 'demo') {
  throw new Error(
    'Refusing to run while JEEBLY_ENV is not "demo": a booking here would dispatch a real courier.',
  );
}

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.subOrder.findUnique({
    where: { id: SUB_ORDER_ID },
    select: {
      subOrderNumber: true,
      status: true,
      packageWeightKg: true,
      codAmount: true,
      awbNumber: true,
      shipmentCreation: true,
      order: { select: { orderNumber: true, addressId: true, paymentMethod: true, paymentStatus: true } },
    },
  });
  if (!before) throw new Error('Sub-order not found. Wrong database?');
  if (before.awbNumber || before.shipmentCreation) {
    throw new Error(
      'This sub-order already has an AWB or a shipment claim. Nothing to do.',
    );
  }
  console.log(
    `before: ${before.subOrderNumber} status=${before.status} weight=${before.packageWeightKg} cod=${before.codAmount} ` +
      `order=${before.order.orderNumber} address=${before.order.addressId} pay=${before.order.paymentMethod}/${before.order.paymentStatus}`,
  );

  const result = await prisma.$transaction(async (tx) => {
    // 1. The order has no delivery address and its customer owns none, so one
    //    has to exist. Labelled so nobody mistakes it for a real customer.
    const address = await tx.customerAddress.create({
      data: {
        userId: CUSTOMER_ID,
        fullName: 'QA Test Recipient (not a real customer)',
        phone: '+971501000002',
        label: 'TEST ADDRESS - DO NOT DISPATCH',
        houseNo: '12',
        line1: 'Test Villa 12, Al Danah',
        area: 'Al Danah',
        city: 'Abu Dhabi',
        country: 'UAE',
        landmark: 'Synthetic test landmark',
        isDefault: false,
      },
      select: { id: true },
    });

    // 2. Attach it, and put the order on cash on delivery. This deliberately
    //    avoids marking a payment as "paid", which would fabricate a payment
    //    record for money nobody received.
    await tx.order.update({
      where: { id: ORDER_ID },
      data: {
        addressId: address.id,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
      },
    });

    // 3. Allocate this parcel's collection amount. The parent order totals are
    //    zero, so the sub-order's own sale price is used.
    const subOrder = await tx.subOrder.update({
      where: { id: SUB_ORDER_ID },
      data: { codAmount: '2177.50' },
      select: { salePrice: true, codAmount: true, packageWeightKg: true, vendorId: true },
    });

    // 4. Placeholder pickup components. REPLACE WITH THE VENDOR'S REAL DETAILS.
    const vendor = await tx.vendor.update({
      where: { id: subOrder.vendorId },
      data: { pickupHouseNo: '1', pickupLandmark: 'Al Danah, Zone 1' },
      select: { storeName: true, pickupHouseNo: true, pickupLandmark: true },
    });

    return { addressId: address.id, subOrder, vendor };
  });

  console.log(`created address : ${result.addressId}`);
  console.log('order           : cod/pending, address attached');
  console.log(
    `sub-order       : codAmount=${result.subOrder.codAmount} weight=${result.subOrder.packageWeightKg} kg`,
  );
  console.log(
    `vendor          : ${result.vendor.storeName} house=${result.vendor.pickupHouseNo} landmark=${result.vendor.pickupLandmark}`,
  );
  console.log('');
  console.log('Now POST ready-for-pickup for sub-order ' + SUB_ORDER_ID);
}

main()
  .catch((error) => {
    // Never dump Prisma errors: they can contain the connection string.
    console.error(error instanceof Error ? error.message : 'Backfill failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
