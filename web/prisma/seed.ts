import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Tenant 1 is created by migration 20260422001115_seed_default_tenant — the
  // lead_status seeds reference it by id. Match on the ID, not the slug: keying
  // on the slug meant a renamed tenant silently produced a SECOND tenant here,
  // with the admin user on it and every seeded lead status on the first one.
  const tenant = await prisma.tenant.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Controllabor Kft.',
      slug: 'controllabor',
    },
  });

  console.log(`Tenant: ${tenant.name} (id=${tenant.id})`);

  const passwordHash = await bcrypt.hash('admin1234', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@controllabor.hu' },
    update: { passwordHash },
    create: {
      tenantId: tenant.id,
      name: 'Admin',
      email: 'admin@controllabor.hu',
      passwordHash,
      role: 'admin',
    },
  });

  console.log(`User: ${admin.email} (id=${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
