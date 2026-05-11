import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { taskInclude, TaskWithRelations } from './entities/task.entity';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    tenantId: number,
    where: Prisma.TaskWhereInput,
    skip: number,
    take: number,
  ): Promise<TaskWithRelations[]> {
    return this.prisma.task.findMany({
      where: { tenantId, ...where },
      include: taskInclude,
      skip,
      take,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    }) as Promise<TaskWithRelations[]>;
  }

  count(tenantId: number, where: Prisma.TaskWhereInput): Promise<number> {
    return this.prisma.task.count({ where: { tenantId, ...where } });
  }

  findById(tenantId: number, id: number): Promise<TaskWithRelations | null> {
    return this.prisma.task.findFirst({
      where: { tenantId, id },
      include: taskInclude,
    }) as Promise<TaskWithRelations | null>;
  }

  create(tenantId: number, data: Prisma.TaskUncheckedCreateInput): Promise<TaskWithRelations> {
    return this.prisma.task.create({
      data,
      include: taskInclude,
    }) as Promise<TaskWithRelations>;
  }

  update(
    tenantId: number,
    id: number,
    data: Prisma.TaskUncheckedUpdateInput,
  ): Promise<TaskWithRelations> {
    return this.prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    }) as Promise<TaskWithRelations>;
  }

  delete(id: number): Promise<void> {
    return this.prisma.task.delete({ where: { id } }).then(() => undefined);
  }
}
