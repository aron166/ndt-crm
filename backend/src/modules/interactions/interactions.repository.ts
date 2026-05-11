import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { interactionInclude, InteractionWithRelations } from './entities/interaction.entity';

@Injectable()
export class InteractionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Append a new interaction — never updates an existing one */
  create(
    tenantId: number,
    userId: number,
    data: {
      companyId?: number;
      personId?: number;
      type?: string;
      direction?: string;
      notes?: string;
      outcome?: string;
      occurredAt?: Date;
    },
  ): Promise<InteractionWithRelations> {
    return this.prisma.interaction.create({
      data: {
        tenantId,
        userId,
        ...data,
      },
      include: interactionInclude,
    }) as Promise<InteractionWithRelations>;
  }

  findByCompany(
    tenantId: number,
    companyId: number,
    skip: number,
    take: number,
  ): Promise<InteractionWithRelations[]> {
    return this.prisma.interaction.findMany({
      where: { tenantId, companyId },
      include: interactionInclude,
      orderBy: { occurredAt: 'desc' },
      skip,
      take,
    }) as Promise<InteractionWithRelations[]>;
  }

  countByCompany(tenantId: number, companyId: number): Promise<number> {
    return this.prisma.interaction.count({ where: { tenantId, companyId } });
  }

  findByPerson(
    tenantId: number,
    personId: number,
    skip: number,
    take: number,
  ): Promise<InteractionWithRelations[]> {
    return this.prisma.interaction.findMany({
      where: { tenantId, personId },
      include: interactionInclude,
      orderBy: { occurredAt: 'desc' },
      skip,
      take,
    }) as Promise<InteractionWithRelations[]>;
  }

  countByPerson(tenantId: number, personId: number): Promise<number> {
    return this.prisma.interaction.count({ where: { tenantId, personId } });
  }
}
