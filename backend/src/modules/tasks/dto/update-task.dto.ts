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

/**
 * All fields optional — send only what you want to change.
 * Explicit class instead of PartialType to avoid @Transform metadata issues with forbidNonWhitelisted.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

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

  @IsOptional()
  @IsInt()
  @IsPositive()
  estimatedMinutes?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  actualMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurrenceRule?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  notifyBefore?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  assignedToId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  companyId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  personId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dealId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  parentTaskId?: number;
}
