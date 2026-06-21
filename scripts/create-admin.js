/**
 * One-off script to provision an admin account directly in the database.
 *
 * Since the auth module (and its signup endpoints) was removed, this is how the
 * first admin is bootstrapped. It is idempotent — re-running updates the
 * password and ensures the admin role + profile exist.
 *
 * Usage:
 *   node scripts/create-admin.js                      # uses the defaults below
 *   ADMIN_EMAIL=x@y.com ADMIN_PASSWORD=Secret node scripts/create-admin.js
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

const email = (process.env.ADMIN_EMAIL ?? 'devzookteam@gmail.com').toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? 'Zook@123';
const fullName = process.env.ADMIN_NAME ?? 'Zook Dev Admin';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    // Create or update the base user (email is unique).
    const u = await tx.user.upsert({
      where: { email },
      create: { email, fullName, passwordHash, emailVerified: true },
      update: { passwordHash, emailVerified: true },
    });

    // Grant the admin role (idempotent via the @@unique([userId, role])).
    await tx.userRole.upsert({
      where: { userId_role: { userId: u.id, role: 'admin' } },
      create: { userId: u.id, role: 'admin' },
      update: {},
    });

    // Ensure the admin profile exists (1-1 with the user). Super admin so this
    // bootstrap account can do everything.
    await tx.admin.upsert({
      where: { userId: u.id },
      create: {
        userId: u.id,
        level: 'super_admin',
        department: 'platform',
        permissions: ['*'],
        status: 'active',
      },
      update: { level: 'super_admin', status: 'active' },
    });

    return u;
  });

  console.log('✅ Admin ready');
  console.log(`   id    : ${user.id}`);
  console.log(`   email : ${user.email}`);
  console.log(`   roles : admin (super_admin)`);
}

main()
  .catch((err) => {
    console.error('❌ Failed to create admin:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
