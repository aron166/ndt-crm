import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Company } from './entities/company.entity';

@Injectable()
export class CompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    tenantId: number,
    where: Prisma.CompanyWhereInput,
    skip: number,
    take: number,
  ): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: { tenantId, ...where },
      skip,
      take,
      orderBy: { name: 'asc' },
    });
  }

  count(tenantId: number, where: Prisma.CompanyWhereInput): Promise<number> {
    return this.prisma.company.count({ where: { tenantId, ...where } });
  }

  findById(tenantId: number, id: number): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { tenantId, id } });
  }

  findByVatNumber(tenantId: number, vatNumber: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { tenantId, vatNumber } });
  }

  create(tenantId: number, data: Prisma.CompanyCreateWithoutTenantInput): Promise<Company> {
    return this.prisma.company.create({
      data: { tenantId, ...data },
    });
  }

  update(
    tenantId: number,
    id: number,
    data: Prisma.CompanyUncheckedUpdateInput,
  ): Promise<Company> {
    return this.prisma.company.update({
      where: { id },
      data: { tenantId, ...data },
    });
  }

  delete(tenantId: number, id: number): Promise<Company> {
    return this.prisma.company.delete({ where: { id } });
  }
}
