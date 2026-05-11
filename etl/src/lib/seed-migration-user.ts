import { prisma } from './prisma';

/**
 * Ensures the system migration user (id=1 within tenant) exists.
 * Returns the user's id in the destination DB.
 */
export async function seedMigrationUser(tenantId: number): Promise<number> {
  const email = 'migration@system';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      tenantId,
      name: 'Migration',
      email,
      passwordHash: 'SYSTEM_NO_LOGIN',
      role: 'admin',
    },
  });

  console.log(`  [seed] Created migration user id=${created.id}`);
  return created.id;
}
