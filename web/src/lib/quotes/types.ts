import type { QuoteStatus } from "./status";

export interface QuoteLineDTO {
  costCode: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitRate: number | null;
  amount: number;
}

export interface QuoteDTO {
  id: number;
  companyId: number;
  companyName: string;
  personId: number | null;
  personName: string | null;
  leadId: number | null;
  dealId: number | null;
  quoteNumber: string;
  title: string;
  status: QuoteStatus;
  currency: string;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  validUntil: Date | null;
  notes: string | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: QuoteLineDTO[];
}

export interface QuoteListItem {
  id: number;
  quoteNumber: string;
  title: string;
  status: QuoteStatus;
  companyId: number;
  companyName: string;
  grossAmount: number;
  currency: string;
  validUntil: Date | null;
  createdAt: Date;
}

export interface QuoteInput {
  companyId: number;
  personId?: number | null;
  leadId?: number | null;
  dealId?: number | null;
  title: string;
  vatRate: number;
  validUntil?: string | null; // ISO date (yyyy-mm-dd) or null
  notes?: string | null;
  lines: Array<{
    costCode: string | null;
    description: string;
    quantity: number | null;
    unit: string | null;
    unitRate: number | null;
  }>;
}
