export class Person {
  id: number;
  tenantId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape returned by the list endpoint — includes active company for the table column */
export interface PersonSummary extends Person {
  currentCompany: { id: number; name: string } | null;
}
