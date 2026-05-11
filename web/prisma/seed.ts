import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'controllabor' },
    update: {},
    create: {
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
