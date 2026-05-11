export class Company {
  id: number;
  tenantId: number;
  name: string;
  vatNumber: string | null;
  shortCode: string | null;
  status: string | null;
  accountType: string | null;
  industryCode: string | null;
  country: string | null;
  county: string | null;
  city: string | null;
  address: string | null;
  zipCode: string | null;
  website: string | null;
  pipelineStatus: string | null;
  lastInteractionDate: Date | null;
  lastInteractionOwner: string | null;
  createdAt: Date;
  updatedAt: Date;
}
