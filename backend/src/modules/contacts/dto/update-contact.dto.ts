import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Only mutable fields — personId and companyId cannot change.
 * To move a person to a new company: close this contact, create a new one.
 */
export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
