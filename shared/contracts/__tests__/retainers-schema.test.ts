import { describe, it, expect } from 'vitest';
import {
  RETAINER_COMPANY_MAX,
  RETAINER_CURRENT_PROJECTS_MAX,
  RETAINER_DEFAULT_MONTHLY_FEE_USD,
  RETAINER_MONTHLY_FEE_MAX,
  RETAINER_NEEDS_MAX,
  RETAINER_NOTES_MAX,
  RETAINER_REFERENCE_CODE_REGEX,
  RETAINER_STATUSES,
  RetainerSchema,
  RetainerUpdateSchema,
} from '@/shared/contracts/retainers';

const validRetainer = {
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  email: 'ahmad@example.com',
  company: 'شركة النُّور للتجارة',
  current_projects: 'متجر إلكترونيّ على ووردبريس، وموقع تعريفيّ لشركة صغيرة.',
  needs: 'صيانة دوريَّة، إصلاح الأعطال، وإضافة ميزات جديدة كلَّ شهر.',
  preferred_start: '2026-11-01',
};

describe('RetainerSchema', () => {
  it('accepts a valid request', () => {
    expect(RetainerSchema.safeParse(validRetainer).success).toBe(true);
  });

  it('accepts a request that omits every optional field', () => {
    const result = RetainerSchema.safeParse({
      full_name: validRetainer.full_name,
      phone_whatsapp: validRetainer.phone_whatsapp,
      current_projects: validRetainer.current_projects,
      needs: validRetainer.needs,
    });

    expect(result.success).toBe(true);
  });

  it('accepts blank optional fields', () => {
    const result = RetainerSchema.safeParse({
      ...validRetainer,
      email: '',
      company: '',
      preferred_start: '',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a one-character name', () => {
    const result = RetainerSchema.safeParse({ ...validRetainer, full_name: 'أ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('حرفين');
  });

  it('rejects a malformed phone', () => {
    const result = RetainerSchema.safeParse({ ...validRetainer, phone_whatsapp: 'call-me' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('واتساب');
  });

  it('rejects a malformed email but accepts its absence', () => {
    expect(RetainerSchema.safeParse({ ...validRetainer, email: 'nope' }).success).toBe(false);

    const { email: _email, ...withoutEmail } = validRetainer;
    expect(RetainerSchema.safeParse(withoutEmail).success).toBe(true);
  });

  it('rejects a company name past the maximum', () => {
    const result = RetainerSchema.safeParse({
      ...validRetainer,
      company: 'ش'.repeat(RETAINER_COMPANY_MAX + 1),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('الشركة');
  });

  it('rejects a project list shorter than the minimum', () => {
    const result = RetainerSchema.safeParse({ ...validRetainer, current_projects: 'متجر' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('30');
  });

  it('rejects a statement of needs shorter than the minimum', () => {
    const result = RetainerSchema.safeParse({ ...validRetainer, needs: 'صيانة' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('30');
  });

  it('rejects either prose field past the maximum', () => {
    const tooLong = 'ا'.repeat(RETAINER_CURRENT_PROJECTS_MAX + 1);
    const overLongNeeds = 'ا'.repeat(RETAINER_NEEDS_MAX + 1);

    expect(RetainerSchema.safeParse({ ...validRetainer, current_projects: tooLong }).success).toBe(
      false
    );
    expect(RetainerSchema.safeParse({ ...validRetainer, needs: overLongNeeds }).success).toBe(
      false
    );
  });

  it('rejects a preferred start that is not an ISO date', () => {
    expect(
      RetainerSchema.safeParse({ ...validRetainer, preferred_start: 'next week' }).success
    ).toBe(false);
    expect(
      RetainerSchema.safeParse({ ...validRetainer, preferred_start: '01/11/2026' }).success
    ).toBe(false);
  });

  it('rejects an ISO-shaped but impossible date', () => {
    expect(
      RetainerSchema.safeParse({ ...validRetainer, preferred_start: '2026-13-45' }).success
    ).toBe(false);
  });
});

describe('RETAINER_STATUSES', () => {
  it('lists the documented lifecycle', () => {
    expect([...RETAINER_STATUSES]).toEqual(['new', 'contacted', 'active', 'paused', 'ended']);
  });
});

describe('RETAINER_DEFAULT_MONTHLY_FEE_USD', () => {
  it('is the advertised figure the copy and the table default share', () => {
    expect(RETAINER_DEFAULT_MONTHLY_FEE_USD).toBe(100);
  });
});

describe('RETAINER_REFERENCE_CODE_REGEX', () => {
  it('matches a generated-looking code', () => {
    expect(RETAINER_REFERENCE_CODE_REGEX.test('RET-2026-A7K2M9QX')).toBe(true);
  });

  it('rejects a lowercase, short or foreign-prefix code', () => {
    expect(RETAINER_REFERENCE_CODE_REGEX.test('ret-2026-a7k2m9qx')).toBe(false);
    expect(RETAINER_REFERENCE_CODE_REGEX.test('RET-2026-A7K2')).toBe(false);
    expect(RETAINER_REFERENCE_CODE_REGEX.test('PRJ-2026-A7K2M9QX')).toBe(false);
  });
});

describe('RetainerUpdateSchema', () => {
  it('accepts every documented status', () => {
    for (const status of RETAINER_STATUSES) {
      expect(RetainerUpdateSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    const result = RetainerUpdateSchema.safeParse({ status: 'archived' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('حالة');
  });

  it('accepts an edit that omits the status entirely, because the UI sends only what changed', () => {
    expect(RetainerUpdateSchema.safeParse({ monthly_fee_usd: 250 }).success).toBe(true);
    expect(RetainerUpdateSchema.safeParse({ notes: 'ملاحظة' }).success).toBe(true);
  });

  it('accepts present, null and absent notes', () => {
    expect(RetainerUpdateSchema.safeParse({ status: 'active', notes: 'اتُّفق' }).success).toBe(
      true
    );
    expect(RetainerUpdateSchema.safeParse({ status: 'active', notes: null }).success).toBe(true);
    expect(RetainerUpdateSchema.safeParse({ status: 'active' }).success).toBe(true);
  });

  it('rejects notes past the maximum', () => {
    const result = RetainerUpdateSchema.safeParse({
      status: 'active',
      notes: 'ا'.repeat(RETAINER_NOTES_MAX + 1),
    });

    expect(result.success).toBe(false);
  });

  it('accepts an agreed fee and accepts its absence', () => {
    expect(RetainerUpdateSchema.safeParse({ status: 'active', monthly_fee_usd: 250 }).success).toBe(
      true
    );
    expect(RetainerUpdateSchema.safeParse({ status: 'active' }).success).toBe(true);
  });

  it('rejects a fee that is not a positive number', () => {
    for (const monthly_fee_usd of [0, -50, Number.NaN]) {
      const result = RetainerUpdateSchema.safeParse({ status: 'active', monthly_fee_usd });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain('الرَّسم');
    }
  });

  it('rejects a fee with sub-cent precision rather than letting the column round it', () => {
    const result = RetainerUpdateSchema.safeParse({ status: 'active', monthly_fee_usd: 100.999 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('منزلتين');
  });

  it('accepts a fee with exactly two decimals', () => {
    expect(
      RetainerUpdateSchema.safeParse({ status: 'active', monthly_fee_usd: 149.99 }).success
    ).toBe(true);
  });

  it('rejects a fee past what the column can hold', () => {
    expect(
      RetainerUpdateSchema.safeParse({ status: 'active', monthly_fee_usd: 100_000_000 }).success
    ).toBe(false);
    expect(
      RetainerUpdateSchema.safeParse({
        status: 'active',
        monthly_fee_usd: RETAINER_MONTHLY_FEE_MAX,
      }).success
    ).toBe(true);
  });

  it('accepts a past paid-through date, because it records money already collected', () => {
    expect(
      RetainerUpdateSchema.safeParse({ status: 'ended', paid_through: '2020-01-01' }).success
    ).toBe(true);
  });

  it('accepts null and absent paid-through, so it can be cleared or left alone', () => {
    expect(RetainerUpdateSchema.safeParse({ status: 'paused', paid_through: null }).success).toBe(
      true
    );
    expect(RetainerUpdateSchema.safeParse({ status: 'paused' }).success).toBe(true);
  });

  it('rejects a paid-through that is not an ISO date', () => {
    for (const paid_through of ['next week', '01/11/2026', '2026-13-45']) {
      expect(RetainerUpdateSchema.safeParse({ status: 'active', paid_through }).success).toBe(
        false
      );
    }
  });

  it('rejects a calendar day that does not exist, which Date.parse would silently roll over', () => {
    for (const paid_through of ['2026-02-30', '2026-04-31', '2026-11-31']) {
      expect(RetainerUpdateSchema.safeParse({ paid_through }).success).toBe(false);
    }
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(RetainerUpdateSchema.safeParse({ paid_through: '2028-02-29' }).success).toBe(true);
    expect(RetainerUpdateSchema.safeParse({ paid_through: '2026-02-29' }).success).toBe(false);
  });
});
