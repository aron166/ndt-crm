import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta, PaginationMeta } from '../../common/types/pagination';
import { CreatePersonDto } from './dto/create-person.dto';
import { ListPersonsDto } from './dto/list-persons.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { Person, PersonSummary } from './entities/person.entity';
import { PersonsRepository } from './persons.repository';

@Injectable()
export class PersonsService {
  constructor(private readonly personsRepository: PersonsRepository) {}

  async list(
    tenantId: number,
    query: ListPersonsDto,
  ): Promise<{ data: PersonSummary[]; meta: PaginationMeta }> {
    const where = this.buildWhereClause(query);
    const skip = (query.page - 1) * query.pageSize;

    const [data, total] = await Promise.all([
      this.personsRepository.findMany(tenantId, where, skip, query.pageSize),
      this.personsRepository.count(tenantId, where),
    ]);

    return { data, meta: buildMeta(total, query.page, query.pageSize) };
  }

  async getById(tenantId: number, id: number): Promise<{ data: Person }> {
    const person = await this.personsRepository.findById(tenantId, id);
    if (!person) throw new NotFoundException(`Person ${id} not found`);
    return { data: person };
  }

  async create(tenantId: number, dto: CreatePersonDto): Promise<{ data: Person }> {
    const person = await this.personsRepository.create(tenantId, dto);
    return { data: person };
  }

  async update(
    tenantId: number,
    id: number,
    dto: UpdatePersonDto,
  ): Promise<{ data: Person }> {
    await this.getById(tenantId, id);
    const person = await this.personsRepository.update(tenantId, id, dto);
    return { data: person };
  }

  async delete(tenantId: number, id: number): Promise<void> {
    await this.getById(tenantId, id);
    await this.personsRepository.delete(tenantId, id);
  }

  private buildWhereClause(query: ListPersonsDto): Prisma.PersonWhereInput {
    if (!query.search) return {};

    return {
      OR: [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }
}
