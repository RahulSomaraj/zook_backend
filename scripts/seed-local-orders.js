/** Local-only fixtures and an authenticated ready-for-pickup smoke test. */
const { PrismaClient } = require('@prisma/client');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const connection = new URL(process.env.DATABASE_URL ?? '');
if (
  connection.hostname !== '127.0.0.1' ||
  connection.port !== '5433' ||
  connection.pathname !== '/zook_local' ||
  process.env.NODE_ENV !== 'development' ||
  process.env.OTP_TEST_MODE !== 'true'
) {
  throw new Error(
    'This script requires the isolated local database and OTP test mode. Run npm run seed:local:orders.',
  );
}

const prisma = new PrismaClient();
const phone = '+971501000001';
const ids = {
  vendorUser: 'a1000000-0000-4000-8000-000000000001',
  customer: 'a1000000-0000-4000-8000-000000000002',
  vendor: 'a2000000-0000-4000-8000-000000000001',
  address: 'a3000000-0000-4000-8000-000000000001',
  catalog: 'a4000000-0000-4000-8000-000000000001',
  product: 'a5000000-0000-4000-8000-000000000001',
  order: 'a6000000-0000-4000-8000-000000000001',
  packed: 'a7000000-0000-4000-8000-000000000001',
  missingPhoto: 'a7000000-0000-4000-8000-000000000002',
  confirmed: 'a7000000-0000-4000-8000-000000000003',
  noWeight: 'a7000000-0000-4000-8000-000000000004',
};

async function seed() {
  return prisma.$transaction(async (tx) => {
    const country = await tx.country.upsert({
      where: { iso2: 'AE' },
      update: {},
      create: {
        name: 'United Arab Emirates',
        iso2: 'AE',
        dialCode: '+971',
        currencyCode: 'AED',
        currencyName: 'UAE Dirham',
        currencySymbol: 'AED',
        isDefault: true,
      },
    });
    await tx.user.upsert({
      where: { id: ids.vendorUser },
      update: {},
      create: {
        id: ids.vendorUser,
        email: 'vendor.ready@zook.test',
        fullName: 'Local Test Vendor',
        phone,
        countryCode: '+971',
        phoneVerified: true,
        emailVerified: true,
        termsAccepted: true,
        userRoles: { create: { role: 'vendor' } },
      },
    });
    await tx.vendor.upsert({
      where: { id: ids.vendor },
      // The structured pickup components are reapplied on reruns so a vendor
      // seeded before these columns existed converges.
      update: { pickupHouseNo: '7', pickupLandmark: 'Opposite Al Khail Mall' },
      create: {
        id: ids.vendor,
        userId: ids.vendorUser,
        storeName: 'Local Test Electronics',
        phone,
        countryId: country.id,
        currency: 'AED',
        status: 'approved',
        storeAddress: 'Shop 7, Local Test Tower',
        pickupArea: 'Al Barsha',
        pickupEmirate: 'dubai',
        pickupHouseNo: '7',
        pickupLandmark: 'Opposite Al Khail Mall',
      },
    });
    await tx.user.upsert({
      where: { id: ids.customer },
      update: {},
      create: {
        id: ids.customer,
        email: 'customer.ready@zook.test',
        fullName: 'Local Test Customer',
        phone: '+971551000002',
        countryCode: '+971',
        phoneVerified: true,
        termsAccepted: true,
        userRoles: { create: { role: 'customer' } },
      },
    });
    await tx.customerAddress.upsert({
      where: { id: ids.address },
      update: { houseNo: '42', area: 'Al Nahda' },
      create: {
        id: ids.address,
        userId: ids.customer,
        fullName: 'Local Test Customer',
        phone: '+971551000002',
        label: 'Home',
        houseNo: '42',
        line1: 'Apartment 42, Local Customer Tower',
        line2: 'Test Street',
        area: 'Al Nahda',
        city: 'Sharjah',
        country: 'UAE',
        landmark: 'Local test landmark',
        isDefault: true,
      },
    });
    const brand = await tx.brand.upsert({
      where: { name: 'Local Test Brand' },
      update: {},
      create: { name: 'Local Test Brand', slug: 'local-test-brand' },
    });
    const category = await tx.category.upsert({
      where: { name: 'Local Test Smartphones' },
      update: {},
      create: {
        name: 'Local Test Smartphones',
        slug: 'local-test-smartphones',
      },
    });
    await tx.productCatalog.upsert({
      where: { id: ids.catalog },
      update: {},
      create: {
        id: ids.catalog,
        brandId: brand.id,
        categoryId: category.id,
        model: 'Demo Phone',
        year: 2026,
        status: 'active',
      },
    });
    await tx.product.upsert({
      where: { id: ids.product },
      update: {},
      create: {
        id: ids.product,
        vendorId: ids.vendor,
        catalogId: ids.catalog,
        source: 'vendor',
        conditionGrade: 'good',
        inspectionImages: [],
        price: '1000.00',
        stockQty: 3,
        status: 'approved',
        description:
          'Synthetic local API test product; no shipping weight or payment facts supplied.',
      },
    });
    // Cash on delivery, so the fixture exercises a real shippable payment state
    // without fabricating a verified card payment. Reapplied on reruns so an
    // order seeded before the payment columns existed converges.
    await tx.order.upsert({
      where: { id: ids.order },
      update: { paymentMethod: 'cod', paymentStatus: 'pending' },
      create: {
        id: ids.order,
        orderNumber: 'LOCAL-READY-ORDER-001',
        customerId: ids.customer,
        addressId: ids.address,
        subtotal: '3000.00',
        deliveryFee: '0.00',
        totalAmount: '3000.00',
        paymentId: null,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
      },
    });

    // codAmount is this parcel's own collection amount: its sale price plus its
    // share of a zero delivery fee. It is never the parent order total.
    const cases = [
      {
        id: ids.packed,
        number: 'LOCAL-READY-PACKED-001',
        status: 'preparing',
        before: true,
        after: true,
        weightKg: '0.450',
        codAmount: '1000.00',
        expectReady: true,
      },
      {
        id: ids.missingPhoto,
        number: 'LOCAL-READY-MISSING-PHOTO-001',
        expectStatus: 409,
        status: 'preparing',
        before: true,
        after: false,
        weightKg: null,
        codAmount: '1000.00',
      },
      {
        id: ids.confirmed,
        number: 'LOCAL-READY-CONFIRMED-001',
        expectStatus: 409,
        status: 'confirmed',
        before: false,
        after: false,
        weightKg: null,
        codAmount: '1000.00',
      },
      {
        id: ids.noWeight,
        number: 'LOCAL-READY-NO-WEIGHT-001',
        expectStatus: 422,
        status: 'preparing',
        before: true,
        after: true,
        weightKg: null,
        codAmount: '1000.00',
      },
    ];
    for (const fixture of cases) {
      await tx.subOrder.upsert({
        where: { id: fixture.id },
        // Only the shipment-data columns are reapplied, so a fixture whose
        // status or photos were changed while testing keeps that state.
        update: {
          packageWeightKg: fixture.weightKg,
          codAmount: fixture.codAmount,
        },
        create: {
          id: fixture.id,
          subOrderNumber: fixture.number,
          orderId: ids.order,
          vendorId: ids.vendor,
          productId: ids.product,
          status: fixture.status,
          salePrice: '1000.00',
          commissionRate: '10.00',
          processingFee: '29.00',
          payoutAmount: '871.00',
          // Placeholder storage keys for API validation only; no images uploaded.
          packPhotoBeforeUrl: fixture.before
            ? 'local-fixtures/packing/before.jpg'
            : null,
          packPhotoAfterUrl: fixture.after
            ? 'local-fixtures/packing/after.jpg'
            : null,
          photosVerifiedAt: fixture.before && fixture.after ? new Date() : null,
          packageWeightKg: fixture.weightKg,
          codAmount: fixture.codAmount,
          statusHistory: {
            create: [
              {
                status: 'confirmed',
                actorId: ids.vendorUser,
                note: 'Synthetic local test order created',
              },
              ...(fixture.status === 'preparing'
                ? [
                    {
                      status: 'preparing',
                      actorId: ids.vendorUser,
                      note: 'Local fixture: packing photo keys are placeholders, not uploaded images',
                    },
                  ]
                : []),
            ],
          },
        },
      });
    }
    return cases;
  });
}

async function api(route, body, token, method = 'POST') {
  const response = await fetch(`http://localhost:3000/api${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const fixtures = await seed();
  const outputDir = path.join(__dirname, '../.tmp');
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, 'ready-pickup-fixtures.json'),
    JSON.stringify(
      { ids, phone, email: 'vendor.ready@zook.test', fixtures },
      null,
      2,
    ),
  );
  console.log(
    'Local vendor and three sub-orders are available. Reruns preserve existing records.',
  );
  console.log(
    JSON.stringify({ vendorId: ids.vendor, phone, fixtures }, null, 2),
  );

  // Use the actual local OTP login flow rather than bypassing authentication.
  const otp = await api('/auth/vendor/otp/request', { phone });
  const devCode = otp.body.data?.devCode;
  if (otp.status !== 200 || !devCode)
    throw new Error(
      'Local OTP login failed: ensure npm run start:local is running with OTP_TEST_MODE=true.',
    );
  const login = await api('/auth/vendor/otp/verify', { phone, code: devCode });
  const tokens = login.body.data?.tokens;
  if (login.status !== 200 || !tokens?.accessToken)
    throw new Error('Local vendor OTP verification failed.');
  await writeFile(
    path.join(outputDir, 'vendor-access-token.txt'),
    tokens.accessToken,
  );
  console.log('Access token saved to ignored .tmp/vendor-access-token.txt');

  // Only the refusal paths are exercised here. The packed fixture is left
  // armed and NOT posted: with Jeebly credentials configured it would book a
  // real courier shipment on every seed run, which a fixture script must
  // never do. Call it by hand when you want a real booking.
  for (const fixture of fixtures) {
    if (fixture.expectReady) {
      const booked = await prisma.subOrder.findUnique({
        where: { id: fixture.id },
        select: { awbNumber: true, status: true },
      });
      if (booked?.awbNumber) {
        console.log(
          `${fixture.number}: already booked, status=${booked.status}, AWB ${booked.awbNumber} (left untouched)`,
        );
        continue;
      }
      const state = await api(
        `/vendors/me/orders/${fixture.id}/pack-photos`,
        undefined,
        tokens.accessToken,
        'GET',
      );
      const nextAction = state.body.data?.nextAction;
      console.log(
        `${fixture.number}: armed, nextAction=${nextAction} (not posted; would book a real shipment)`,
      );
      if (state.status !== 200 || nextAction !== 'ready_for_pickup')
        throw new Error(
          'Packed fixture is not ready to ship. Its state may have been changed while testing.',
        );
      continue;
    }
    const response = await api(
      `/vendors/me/orders/${fixture.id}/ready-for-pickup`,
      {},
      tokens.accessToken,
    );
    console.log(
      `${fixture.number}: HTTP ${response.status}, ${response.body.code ?? response.body.message}`,
    );
    if (response.status !== fixture.expectStatus)
      throw new Error(
        'Unexpected fixture response. Existing fixture state may have been changed; seed reruns do not reset it.',
      );
  }
  // Only the fixtures this script actually posted to must be untouched. The
  // armed fixture is excluded: it legitimately holds an AWB once you book it
  // by hand, and that booking must survive seed reruns.
  const posted = fixtures.filter((fixture) => !fixture.expectReady);
  const rows = await prisma.subOrder.findMany({
    where: { id: { in: posted.map((fixture) => fixture.id) } },
    select: { id: true, status: true, awbNumber: true, shipmentCreation: true },
  });
  if (
    rows.some((row) => row.awbNumber !== null || row.shipmentCreation !== null)
  )
    throw new Error(
      'Unexpected AWB or shipment claim on local validation fixtures.',
    );
  console.log(
    'Verified: the refusal fixtures created no AWBs and no shipment claims.',
  );
}

main()
  .catch((error) => {
    // Avoid dumping Prisma errors or connection credentials.
    console.error(
      error instanceof Error
        ? error.message.replaceAll(connection.password, '[REDACTED]')
        : 'Local fixture setup failed',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
