import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateContactDto {
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  personId: number;

  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsInt()
  @IsPositive()
  companyId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  /** Work email — may differ from person.email */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  /** Work phone — may differ from person.phone */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsDateString()
  startedAt?: string;
}
