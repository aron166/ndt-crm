import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildMeta, PaginationMeta } from '../../common/types/pagination';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskWithRelations, TimeDiff } from './entities/task.entity';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(private readonly tasksRepository: TasksRepository) {}

  async list(
    tenantId: number,
    query: ListTasksDto,
  ): Promise<{ data: TaskWithRelations[]; meta: PaginationMeta }> {
    const where = this.buildWhereClause(query);
    const skip = (query.page - 1) * query.pageSize;

    const [data, total] = await Promise.all([
      this.tasksRepository.findMany(tenantId, where, skip, query.pageSize),
      this.tasksRepository.count(tenantId, where),
    ]);

    return { data, meta: buildMeta(total, query.page, query.pageSize) };
  }

  async getById(tenantId: number, id: number): Promise<{ data: TaskWithRelations }> {
    const task = await this.tasksRepository.findById(tenantId, id);
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return { data: task };
  }

  async create(tenantId: number, dto: CreateTaskDto): Promise<{ data: TaskWithRelations }> {
    const task = await this.tasksRepository.create(tenantId, {
      tenantId,
      title: dto.title,
      description: dto.description,
      type: dto.type,
      category: dto.category,
      status: dto.status ?? 'not_started',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      estimatedMinutes: dto.estimatedMinutes,
      actualMinutes: dto.actualMinutes,
      isRecurring: dto.isRecurring ?? false,
      recurrenceRule: dto.recurrenceRule,
      notifyBefore: dto.notifyBefore,
      assignedToId: dto.assignedToId,
      companyId: dto.companyId,
      personId: dto.personId,
      dealId: dto.dealId,
      parentTaskId: dto.parentTaskId,
    });
    return { data: task };
  }

  async update(
    tenantId: number,
    id: number,
    dto: UpdateTaskDto,
  ): Promise<{ data: TaskWithRelations }> {
    await this.getById(tenantId, id);

    const data: Prisma.TaskUncheckedUpdateInput = { ...dto };

    // When marking done, stamp completedAt
    if (dto.status === 'done') {
      data.completedAt = new Date();
    }

    // When un-completing, clear the stamp
    if (dto.status && dto.status !== 'done') {
      data.completedAt = null;
    }

    if (dto.dueDate) {
      data.dueDate = new Date(dto.dueDate);
    }

    const task = await this.tasksRepository.update(tenantId, id, data);
    return { data: task };
  }

  async complete(tenantId: number, id: number): Promise<{ data: TaskWithRelations }> {
    await this.getById(tenantId, id);
    const task = await this.tasksRepository.update(tenantId, id, {
      status: 'done',
      completedAt: new Date(),
    });
    return { data: task };
  }

  async delete(tenantId: number, id: number): Promise<void> {
    await this.getById(tenantId, id);
    await this.tasksRepository.delete(id);
  }

  async getTimeDiff(tenantId: number, id: number): Promise<{ data: TimeDiff }> {
    const { data: task } = await this.getById(tenantId, id);

    const estimated = task.estimatedMinutes ?? null;
    const actual = task.actualMinutes ?? null;

    const diffMinutes = estimated !== null && actual !== null ? actual - estimated : null;
    const diffPercent =
      estimated !== null && actual !== null && estimated > 0
        ? Math.round(((actual - estimated) / estimated) * 100)
        : null;

    return {
      data: { taskId: id, estimatedMinutes: estimated, actualMinutes: actual, diffMinutes, diffPercent },
    };
  }

  private buildWhereClause(query: ListTasksDto): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.category) where.category = query.category;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.companyId) where.companyId = query.companyId;
    if (query.personId) where.personId = query.personId;
    if (query.dealId) where.dealId = query.dealId;
    if (query.topLevelOnly) where.parentTaskId = null;

    if (query.dueBefore || query.dueAfter) {
      where.dueDate = {
        ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
        ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
      };
    }

    return where;
  }
}
