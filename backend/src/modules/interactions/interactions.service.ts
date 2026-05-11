import { Injectable } from '@nestjs/common';
import { buildMeta, PaginationMeta } from '../../common/types/pagination';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { ListInteractionsDto } from './dto/list-interactions.dto';
import { InteractionWithRelations } from './entities/interaction.entity';
import { InteractionsRepository } from './interactions.repository';

@Injectable()
export class InteractionsService {
  constructor(private readonly interactionsRepository: InteractionsRepository) {}

  async log(
    tenantId: number,
    userId: number,
    dto: CreateInteractionDto,
  ): Promise<{ data: InteractionWithRelations }> {
    const interaction = await this.interactionsRepository.create(tenantId, userId, {
      companyId: dto.companyId,
      personId: dto.personId,
      type: dto.type,
      direction: dto.direction,
      notes: dto.notes,
      outcome: dto.outcome,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
    });
    return { data: interaction };
  }

  async listByCompany(
    tenantId: number,
    companyId: number,
    query: ListInteractionsDto,
  ): Promise<{ data: InteractionWithRelations[]; meta: PaginationMeta }> {
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.interactionsRepository.findByCompany(tenantId, companyId, skip, query.pageSize),
      this.interactionsRepository.countByCompany(tenantId, companyId),
    ]);
    return { data, meta: buildMeta(total, query.page, query.pageSize) };
  }

  async listByPerson(
    tenantId: number,
    personId: number,
    query: ListInteractionsDto,
  ): Promise<{ data: InteractionWithRelations[]; meta: PaginationMeta }> {
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.interactionsRepository.findByPerson(tenantId, personId, skip, query.pageSize),
      this.interactionsRepository.countByPerson(tenantId, personId),
    ]);
    return { data, meta: buildMeta(total, query.page, query.pageSize) };
  }
}
