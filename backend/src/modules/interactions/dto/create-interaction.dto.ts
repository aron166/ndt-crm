import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

const INTERACTION_TYPES = ['call', 'email', 'meeting', 'note', 'site_visit'] as const;
const INTERACTION_DIRECTIONS = ['inbound', 'outbound'] as const;

export class CreateInteractionDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  companyId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  personId?: number;

  @IsOptional()
  @IsIn(INTERACTION_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(INTERACTION_DIRECTIONS)
  direction?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Maps to 0-8 pipeline status codes */
  @IsOptional()
  @IsString()
  outcome?: string;

  /** Defaults to now() if omitted */
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
