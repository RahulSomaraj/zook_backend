/**
 * Creates a SHIPPABLE synthetic order for an existing vendor so the Jeebly
 * flow (ready-for-pickup -> AWB -> label) can be exercised end to end against
 * the DEMO courier API. Every value is a clearly labelled placeholder.
 *
 * What it writes:
 *   - a synthetic customer user (upserted by email) with one delivery address
 *     mirroring the Jeebly sample payload (Dubai Marina)
 *   - one new order + one sub-order for the chosen vendor product, already
 *     `preparing` with placeholder packing-photo keys, a package weight and a
 *     COD allocation, so the very next step is POST ready-for-pickup
 *
 * Usage (from the repo root):
 *   node --env-file=.env scripts/seed-cloud-test-order.js
 *   node --env-file=.env scripts/seed-cloud-test-order.js --vendor <vendorId> --product <productId> --weight 1.25 --payment cod
 *
 * Guard rails: refuses NODE_ENV=production and any non-demo Jeebly setting,
 * because the order this creates is meant to be booked with the courier.
 */
const { PrismaClient, Prisma } = require('@prisma/client');

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run against NODE_ENV=production.');
}
if ((process.env.JEEBLY_ENV ?? 'demo') !== 'demo') {
  throw new Error(
    'Refusing to run while JEEBLY_ENV is not "demo": booking this order would dispatch a real courier.',
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((value, index, all) =>
      value.startsWith('--') ? [value.slice(2), all[index + 1]] : null,
    )
    .filter(Boolean),
);

// Defaults: LLK Electricals (Abu Dhabi pickup, already verified with Jeebly)
// selling its approved "iPhone 14 Pro 512GB Blue" listing.
const VENDOR_ID = args.vendor ?? '9f0c9a92-f09a-49f2-bdde-ad5efcb595e9';
const PRODUCT_ID = args.product ?? '6e890be3-7dad-4437-8bf5-dbdbdf3f15a8';
const WEIGHT_KG = new Prisma.Decimal(args.weight ?? '1.250').toDecimalPlaces(3);
const PAYMENT = args.payment ?? 'cod'; // 'cod' | 'prepaid'
const MAMO_FEE_RATE = new Prisma.Decimal(process.env.MAMO_FEE_RATE ?? '0.029');

if (!['cod', 'prepaid'].includes(PAYMENT)) {
  throw new Error('--payment must be "cod" or "prepaid"');
}

// Synthetic customer. The address mirrors Jeebly's own sample destination so
// the mapped payload is obviously a test one. Phone is a UAE-shaped number
// that Jeebly accepts as a destination mobile (+9715xxxxxxxx).
const CUSTOMER = {
  email: 'jane.doe.test@zook.test',
  fullName: 'Jane Doe (test customer)',
  phone: '+971501000003',
};
const ADDRESS = {
  fullName: 'Jane Doe (test customer - do not dispatch)',
  phone: '+971501000003',
  label: 'TEST ADDRESS - DO NOT DISPATCH',
  houseNo: 'Apt 205',
  line1: 'Marina Heights',
  line2: null,
  area: 'Dubai Marina',
  city: 'Dubai',
  country: 'UAE',
  landmark: 'Near Metro Station',
};

const money = (value) =>
  new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

// Same arithmetic as src/common/utils/payout.util.ts (kept in sync by hand).
function payoutBreakdown(salePrice, commissionRate) {
  const price = new Prisma.Decimal(salePrice);
  const commission = money(price.mul(commissionRate).div(100));
  const processingFee = money(price.mul(MAMO_FEE_RATE));
  const payoutAmount = money(price.minus(commission).minus(processingFee));
  return { commission, processingFee, payoutAmount };
}

const stamp = Date.now().toString().slice(-6);
const ORDER_NUMBER = `ORD-TEST-${stamp}`;
const SUB_ORDER_NUMBER = `SUB-TEST-${stamp}-1`;

const prisma = new PrismaClient();

async function main() {
  const vendor = await prisma.vendor.findUnique({
    where: { id: VENDOR_ID },
    select: {
      id: true,
      storeName: true,
      status: true,
      commissionRate: true,
      storeAddress: true,
      pickupArea: true,
      pickupEmirate: true,
      pickupHouseNo: true,
      pickupLandmark: true,
      phone: true,
      user: { select: { id: true, phone: true } },
    },
  });
  if (!vendor) throw new Error('Vendor not found. Wrong database or --vendor?');
  const pickupGaps = [
    ['storeAddress', vendor.storeAddress],
    ['pickupArea', vendor.pickupArea],
    ['pickupEmirate', vendor.pickupEmirate],
    ['pickupHouseNo', vendor.pickupHouseNo],
    ['pickupLandmark', vendor.pickupLandmark],
    ['phone', vendor.phone ?? vendor.user.phone],
  ]
    .filter(([, value]) => !value)
    .map(([field]) => field);
  if (pickupGaps.length) {
    throw new Error(
      `Vendor ${vendor.storeName} is missing pickup data Jeebly needs: ${pickupGaps.join(', ')}. Fill these on the vendor profile first.`,
    );
  }

  const product = await prisma.product.findFirst({
    where: { id: PRODUCT_ID, vendorId: VENDOR_ID },
    select: {
      id: true,
      price: true,
      catalog: { select: { model: true, brand: { select: { name: true } } } },
    },
  });
  if (!product) {
    throw new Error('Product not found for this vendor. Check --product.');
  }

  const salePrice = money(product.price);
  const { commission, processingFee, payoutAmount } = payoutBreakdown(
    salePrice,
    vendor.commissionRate,
  );
  const deliveryFee = money(0);
  const totalAmount = salePrice.plus(deliveryFee);
  // COD collects this parcel's price plus its share of the (zero) delivery fee.
  const codAmount = PAYMENT === 'cod' ? salePrice.plus(deliveryFee) : null;

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.user.upsert({
      where: { email: CUSTOMER.email },
      update: {},
      create: {
        email: CUSTOMER.email,
        fullName: CUSTOMER.fullName,
        phone: CUSTOMER.phone,
        countryCode: '+971',
        phoneVerified: true,
        termsAccepted: true,
        userRoles: { create: { role: 'customer' } },
      },
      select: { id: true },
    });

    const address =
      (await tx.customerAddress.findFirst({
        where: { userId: customer.id, label: ADDRESS.label, deletedAt: null },
        select: { id: true },
      })) ??
      (await tx.customerAddress.create({
        data: { userId: customer.id, ...ADDRESS, isDefault: true },
        select: { id: true },
      }));

    const order = await tx.order.create({
      data: {
        orderNumber: ORDER_NUMBER,
        customerId: customer.id,
        addressId: address.id,
        subtotal: salePrice,
        deliveryFee,
        totalAmount,
        paymentMethod: PAYMENT,
        // Prepaid test orders are marked paid ONLY because no gateway exists in
        // this environment; nobody was charged. COD stays pending by design.
        paymentStatus: PAYMENT === 'prepaid' ? 'paid' : 'pending',
        paidAt: PAYMENT === 'prepaid' ? new Date() : null,
      },
      select: { id: true, orderNumber: true },
    });

    const subOrder = await tx.subOrder.create({
      data: {
        subOrderNumber: SUB_ORDER_NUMBER,
        orderId: order.id,
        vendorId: vendor.id,
        productId: product.id,
        status: 'preparing',
        salePrice,
        commissionRate: vendor.commissionRate,
        processingFee,
        payoutAmount,
        // Placeholder storage keys so the photo gate passes; nothing uploaded.
        packPhotoBeforeUrl: 'test-fixtures/packing/before.jpg',
        packPhotoAfterUrl: 'test-fixtures/packing/after.jpg',
        photosVerifiedAt: new Date(),
        packageWeightKg: WEIGHT_KG,
        codAmount,
        statusHistory: {
          create: [
            {
              status: 'confirmed',
              actorId: null,
              note: 'Synthetic test order created by scripts/seed-cloud-test-order.js',
            },
            {
              status: 'preparing',
              actorId: vendor.user.id,
              note: 'Test fixture: packing photo keys are placeholders, weight and COD pre-filled',
            },
          ],
        },
      },
      select: { id: true, subOrderNumber: true },
    });

    return { customer, address, order, subOrder };
  });

  const item = `${product.catalog.brand.name} ${product.catalog.model}`.trim();
  console.log('Created a shippable test order');
  console.log(`  vendor      : ${vendor.storeName} (login ${vendor.user.phone})`);
  console.log(`  customer    : ${CUSTOMER.fullName} <${CUSTOMER.email}> id=${result.customer.id}`);
  console.log(`  address     : ${ADDRESS.houseNo}, ${ADDRESS.line1}, ${ADDRESS.area}, ${ADDRESS.city} id=${result.address.id}`);
  console.log(`  item        : ${item} @ AED ${salePrice}`);
  console.log(`  order       : ${result.order.orderNumber} id=${result.order.id} (${PAYMENT}, total AED ${totalAmount})`);
  console.log(`  sub-order   : ${result.subOrder.subOrderNumber} id=${result.subOrder.id} (preparing, ${WEIGHT_KG} kg, COD ${codAmount ?? '-'})`);
  console.log(`  vendor payout: AED ${payoutAmount} (commission ${commission}, processing fee ${processingFee})`);
  console.log('');
  console.log('Next, as the vendor:');
  console.log(`  POST /api/vendors/me/orders/${result.subOrder.id}/ready-for-pickup`);
  console.log(`  GET  /api/vendors/me/orders/${result.subOrder.id}/label`);
}

main()
  .catch((error) => {
    // Never dump Prisma errors: they can contain the connection string.
    console.error(error instanceof Error ? error.message : 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
