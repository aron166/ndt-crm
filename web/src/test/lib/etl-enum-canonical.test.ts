import { describe, it, expect } from 'vitest';
import { canonicalCompanyEnums } from '../../../../etl/src/lib/company-enums';

const c = (o: Record<string, unknown>) => canonicalCompanyEnums(o, 't');

describe('etl canonicalCompanyEnums', () => {
  it('maps status', () => {
    expect(c({ status: 'Aktív' }).status).toBe('active');
    expect(c({ status: 'zzz' }).status).toBe('inactive');
    expect(c({ status: 'F.A.' }).status).toBe('fa');
    expect(c({ status: 'Felszámolás alatt' }).status).toBe('fa');
  });
  it('maps account type', () => {
    expect(c({ accountType: 'Ügyfél' }).accountType).toBe('Customer');
    expect(c({ accountType: 'Versenytárs' }).accountType).toBe('Competitor');
  });
  it('maps warmth', () => {
    expect(c({ warmth: 'Hideg' }).warmth).toBe('cold');
    expect(c({ warmth: 'WARM' }).warmth).toBe('warm');
  });
  it('unknown and blank become null', () => {
    expect(c({ accountType: 'Bogus' }).accountType).toBeNull();
    expect(c({ warmth: 'Bogus' }).warmth).toBeNull();
    expect(c({ status: ' ', accountType: '', warmth: null })).toEqual({ status: null, accountType: null, warmth: null });
  });
});
