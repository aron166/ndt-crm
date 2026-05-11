import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta, PaginationMeta } from '../../common/types/pagination';
import { CompaniesRepository } from './companies.repository';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesDto } from './dto/list-companies.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';

@Injectable()
export class CompaniesService {
  constructor(private readonly companiesRepository: CompaniesRepository) {}

  async list(
    tenantId: number,
    query: ListCompaniesDto,
  ): Promise<{ data: Company[]; meta: PaginationMeta }> {
    const where = this.buildWhereClause(query);
    const skip = (query.page - 1) * query.pageSize;

    const [data, total] = await Promise.all([
      this.companiesRepository.findMany(tenantId, where, skip, query.pageSize),
      this.companiesRepository.count(tenantId, where),
    ]);

    return {
      data,
      meta: buildMeta(total, query.page, query.pageSize),
    };
  }

  async getById(tenantId: number, id: number): Promise<{ data: Company }> {
    const company = await this.companiesRepository.findById(tenantId, id);
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return { data: company };
  }

  async create(
    tenantId: number,
    dto: CreateCompanyDto,
  ): Promise<{ data: Company }> {
    if (dto.vatNumber) {
      const existing = await this.companiesRepository.findByVatNumber(
        tenantId,
        dto.vatNumber,
      );
      if (existing) {
        throw new ConflictException(
          `Company with VAT number ${dto.vatNumber} already exists`,
        );
      }
    }

    const data = this.dtoToCreateInput(dto);
    const company = await this.companiesRepository.create(tenantId, data);
    return { data: company };
  }

  async update(
    tenantId: number,
    id: number,
    dto: UpdateCompanyDto,
  ): Promise<{ data: Company }> {
    await this.getById(tenantId, id); // ensures it exists and belongs to tenant

    if (dto.vatNumber) {
      const existing = await this.companiesRepository.findByVatNumber(
        tenantId,
        dto.vatNumber,
      );
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Company with VAT number ${dto.vatNumber} already exists`,
        );
      }
    }

    const company = await this.companiesRepository.update(tenantId, id, dto);
    return { data: company };
  }

  async delete(tenantId: number, id: number): Promise<void> {
    await this.getById(tenantId, id); // ensures it exists and belongs to tenant
    await this.companiesRepository.delete(tenantId, id);
  }

  private buildWhereClause(query: ListCompaniesDto): Prisma.CompanyWhereInput {
    const where: Prisma.CompanyWhereInput = {};

    if (!query.includeFA) {
      where.status = { not: 'F.A.' };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.accountType) {
      where.accountType = query.accountType;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { vatNumber: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private dtoToCreateInput(
    dto: CreateCompanyDto,
  ): Prisma.CompanyCreateWithoutTenantInput {
    return {
      name: dto.name,
      vatNumber: dto.vatNumber,
      shortCode: dto.shortCode,
      status: dto.status,
      accountType: dto.accountType,
      industryCode: dto.industryCode,
      country: dto.country,
      county: dto.county,
      city: dto.city,
      address: dto.address,
      zipCode: dto.zipCode,
      website: dto.website,
      pipelineStatus: dto.pipelineStatus,
      lastInteractionDate: dto.lastInteractionDate
        ? new Date(dto.lastInteractionDate)
        : undefined,
      lastInteractionOwner: dto.lastInteractionOwner,
    };
  }
}
