import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { contactInclude, ContactWithRelations } from './entities/contact.entity';

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(tenantId: number, id: number): Promise<ContactWithRelations | null> {
    return this.prisma.contact.findFirst({
      where: { tenantId, id },
      include: contactInclude,
    }) as Promise<ContactWithRelations | null>;
  }

  /** Active contacts for a company (ended_at IS NULL) */
  findActiveByCompany(tenantId: number, companyId: number): Promise<ContactWithRelations[]> {
    return this.prisma.contact.findMany({
      where: { tenantId, companyId, endedAt: null },
      include: contactInclude,
      orderBy: [{ isPrimary: 'desc' }, { startedAt: 'asc' }],
    }) as Promise<ContactWithRelations[]>;
  }

  /** Full contact history for a person — all companies, including past ones */
  findAllByPerson(tenantId: number, personId: number): Promise<ContactWithRelations[]> {
    return this.prisma.contact.findMany({
      where: { tenantId, personId },
      include: contactInclude,
      orderBy: { startedAt: 'desc' },
    }) as Promise<ContactWithRelations[]>;
  }

  create(
    tenantId: number,
    data: Prisma.ContactUncheckedCreateInput,
  ): Promise<ContactWithRelations> {
    return this.prisma.contact.create({
      data,
      include: contactInclude,
    }) as Promise<ContactWithRelations>;
  }

  update(
    tenantId: number,
    id: number,
    data: Prisma.ContactUncheckedUpdateInput,
  ): Promise<ContactWithRelations> {
    return this.prisma.contact.update({
      where: { id },
      data,
      include: contactInclude,
    }) as Promise<ContactWithRelations>;
  }

  /** Close a contact — sets ended_at to now */
  close(tenantId: number, id: number): Promise<ContactWithRelations> {
    return this.prisma.contact.update({
      where: { id },
      data: { endedAt: new Date() },
      include: contactInclude,
    }) as Promise<ContactWithRelations>;
  }
}
