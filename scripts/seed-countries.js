/**
 * One-off script to seed supported countries and attach an existing vendor to
 * one, so the country-scoped product endpoints have data to return.
 *
 * Usage: node scripts/seed-countries.js
 */
const fs = require('fs');
const path = require('path');

// The Prisma client reads DATABASE_URL from the environment; load .env for
// standalone (non-Nest) execution.
const envPath = path.resolve(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const COUNTRIES = [
  { name: 'United Arab Emirates', iso2: 'AE', dialCode: '+971', currencyCode: 'AED', currencyName: 'UAE Dirham', currencySymbol: 'د.إ', exchangeRate: 1, isDefault: true, sortOrder: 0 },
  { name: 'India', iso2: 'IN', dialCode: '+91', currencyCode: 'INR', currencyName: 'Indian Rupee', currencySymbol: '₹', exchangeRate: 22.7, isDefault: false, sortOrder: 1 },
  { name: 'United States', iso2: 'US', dialCode: '+1', currencyCode: 'USD', currencyName: 'US Dollar', currencySymbol: '$', exchangeRate: 0.27, isDefault: false, sortOrder: 2 },
  { name: 'Saudi Arabia', iso2: 'SA', dialCode: '+966', currencyCode: 'SAR', currencyName: 'Saudi Riyal', currencySymbol: 'ر.س', exchangeRate: 1.02, isDefault: false, sortOrder: 3 },
];

async function main() {
  // 1. Upsert countries (idempotent on unique `name`).
  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { name: c.name },
      create: c,
      update: c,
    });
  }
  const ae = await prisma.country.findUnique({ where: { iso2: 'AE' } });
  console.log('Seeded countries:', (await prisma.country.count()));

  // 2. Attach an approved vendor (preferably one that has products) to AE so
  //    the country filter returns something.
  const vendorWithProducts = await prisma.vendor.findFirst({
    where: { status: 'approved', deletedAt: null, products: { some: {} } },
    select: { id: true, storeName: true },
  });
  const vendor =
    vendorWithProducts ??
    (await prisma.vendor.findFirst({
      where: { status: 'approved', deletedAt: null },
      select: { id: true, storeName: true },
    }));

  if (vendor) {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { countryId: ae.id, currency: ae.currencyCode },
    });
    console.log(`Attached vendor "${vendor.storeName}" (${vendor.id}) to AE`);
  } else {
    console.log('No approved vendor found to attach — country product list will be empty.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
