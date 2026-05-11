import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Person, PersonSummary } from './entities/person.entity';

const listInclude = {
  contacts: {
    where: { endedAt: null },
    select: { company: { select: { id: true, name: true } } },
    orderBy: { startedAt: 'desc' as const },
    take: 1,
  },
} satisfies Prisma.PersonInclude;

@Injectable()
export class PersonsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    tenantId: number,
    where: Prisma.PersonWhereInput,
    skip: number,
    take: number,
  ): Promise<PersonSummary[]> {
    const rows = await this.prisma.person.findMany({
      where: { tenantId, ...where },
      skip,
      take,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: listInclude,
    });

    return rows.map((r) => ({
      ...r,
      currentCompany: r.contacts[0]?.company ?? null,
    }));
  }

  count(tenantId: number, where: Prisma.PersonWhereInput): Promise<number> {
    return this.prisma.person.count({ where: { tenantId, ...where } });
  }

  findById(tenantId: number, id: number): Promise<Person | null> {
    return this.prisma.person.findFirst({ where: { tenantId, id } });
  }

  create(tenantId: number, data: Prisma.PersonCreateWithoutTenantInput): Promise<Person> {
    return this.prisma.person.create({ data: { tenantId, ...data } });
  }

  update(
    tenantId: number,
    id: number,
    data: Prisma.PersonUncheckedUpdateInput,
  ): Promise<Person> {
    return this.prisma.person.update({ where: { id }, data: { tenantId, ...data } });
  }

  delete(tenantId: number, id: number): Promise<Person> {
    return this.prisma.person.delete({ where: { id } });
  }
}
