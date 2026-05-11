import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const TASK_STATUSES = ['not_started', 'in_progress', 'done', 'cancelled'] as const;
const TASK_TYPES = ['call', 'email', 'meeting', 'document', 'field_visit', 'internal'] as const;
const TASK_CATEGORIES = ['revenue', 'cost', 'internal', 'external'] as const;

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(TASK_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(TASK_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Standard time estimate (normaidő) in minutes */
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  estimatedMinutes?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  actualMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  /** RRULE string e.g. "FREQ=WEEKLY;BYDAY=MO" */
  @IsOptional()
  @IsString()
  recurrenceRule?: string;

  /** Days before due date to notify */
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  notifyBefore?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  assignedToId?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  companyId?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  personId?: number;

  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  dealId?: number;

  /** Links this task as a subtask of another */
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  parentTaskId?: number;
}
