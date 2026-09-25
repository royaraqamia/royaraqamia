import { describe, it, expect } from 'vitest';
import {
  PROJECT_REQUEST_BUDGET_RANGES,
  PROJECT_REQUEST_REFERENCE_CODE_REGEX,
  PROJECT_REQUEST_STATUSES,
  PROJECT_REQUEST_TIMELINES,
  PROJECT_REQUEST_TYPES,
  ProjectRequestSchema,
  ProjectRequestUpdateSchema,
} from '@/shared/contracts/project-requests';

const validRequest = {
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  email: 'ahmad@example.com',
  project_type: 'website',
  description: 'أريد متجرًا إلكترونيًّا يعرض المنتجات ويتيح الطَّلب عبر واتساب.',
  budget_range: '300-600',
  timeline: 'flexible',
  existing_url: 'https://example.com',
};

describe('ProjectRequestSchema', () => {
  it('accepts a valid request', () => {
    expect(ProjectRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it('accepts a request that omits every optional field', () => {
    const result = ProjectRequestSchema.safeParse({
      full_name: validRequest.full_name,
      phone_whatsapp: validRequest.phone_whatsapp,
      project_type: validRequest.project_type,
      description: validRequest.description,
    });

    expect(result.success).toBe(true);
  });

  it('accepts blank optional fields', () => {
    const result = ProjectRequestSchema.safeParse({
      ...validRequest,
      email: '',
      existing_url: '',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a one-character name', () => {
    const result = ProjectRequestSchema.safeParse({ ...validRequest, full_name: 'أ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('حرفين');
  });

  it('rejects a malformed phone', () => {
    const result = ProjectRequestSchema.safeParse({
      ...validRequest,
      phone_whatsapp: 'call-me',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('واتساب');
  });

  it('rejects a malformed email but accepts its absence', () => {
    expect(ProjectRequestSchema.safeParse({ ...validRequest, email: 'nope' }).success).toBe(false);

    const { email: _email, ...withoutEmail } = validRequest;
    expect(ProjectRequestSchema.safeParse(withoutEmail).success).toBe(true);
  });

  it('rejects an unknown project type', () => {
    const result = ProjectRequestSchema.safeParse({ ...validRequest, project_type: 'game' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('نوع المشروع');
  });

  it('accepts every documented project type', () => {
    for (const project_type of PROJECT_REQUEST_TYPES) {
      expect(ProjectRequestSchema.safeParse({ ...validRequest, project_type }).success).toBe(true);
    }
  });

  it('rejects a description shorter than the minimum', () => {
    const result = ProjectRequestSchema.safeParse({ ...validRequest, description: 'قصير' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('30');
  });

  it('rejects a description past the maximum', () => {
    const result = ProjectRequestSchema.safeParse({
      ...validRequest,
      description: 'ا'.repeat(2001),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('2,000');
  });

  it('rejects a malformed existing link', () => {
    const result = ProjectRequestSchema.safeParse({
      ...validRequest,
      existing_url: 'example.com/no-scheme',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('رابط');
  });

  it('rejects a budget range or timeline outside the fixed sets', () => {
    expect(ProjectRequestSchema.safeParse({ ...validRequest, budget_range: '1000' }).success).toBe(
      false
    );
    expect(ProjectRequestSchema.safeParse({ ...validRequest, timeline: 'someday' }).success).toBe(
      false
    );
  });

  it('accepts every documented budget range and timeline', () => {
    for (const budget_range of PROJECT_REQUEST_BUDGET_RANGES) {
      expect(ProjectRequestSchema.safeParse({ ...validRequest, budget_range }).success).toBe(true);
    }
    for (const timeline of PROJECT_REQUEST_TIMELINES) {
      expect(ProjectRequestSchema.safeParse({ ...validRequest, timeline }).success).toBe(true);
    }
  });
});

describe('PROJECT_REQUEST_STATUSES', () => {
  it('lists the documented sales states', () => {
    expect([...PROJECT_REQUEST_STATUSES]).toEqual(['new', 'contacted', 'quoted', 'won', 'lost']);
  });
});

describe('PROJECT_REQUEST_REFERENCE_CODE_REGEX', () => {
  it('matches a generated-looking code', () => {
    expect(PROJECT_REQUEST_REFERENCE_CODE_REGEX.test('PRJ-2026-A7K2M9QX')).toBe(true);
  });

  it('rejects a lowercase, short or foreign-prefix code', () => {
    expect(PROJECT_REQUEST_REFERENCE_CODE_REGEX.test('prj-2026-a7k2m9qx')).toBe(false);
    expect(PROJECT_REQUEST_REFERENCE_CODE_REGEX.test('PRJ-2026-A7K2')).toBe(false);
    expect(PROJECT_REQUEST_REFERENCE_CODE_REGEX.test('TRN-2026-A7K2M9QX')).toBe(false);
  });
});

describe('ProjectRequestUpdateSchema', () => {
  it('accepts every documented status', () => {
    for (const status of PROJECT_REQUEST_STATUSES) {
      expect(ProjectRequestUpdateSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    const result = ProjectRequestUpdateSchema.safeParse({ status: 'archived' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('حالة');
  });

  it('accepts present, null and absent notes', () => {
    expect(ProjectRequestUpdateSchema.safeParse({ status: 'won', notes: 'اتُّفق' }).success).toBe(
      true
    );
    expect(ProjectRequestUpdateSchema.safeParse({ status: 'won', notes: null }).success).toBe(true);
    expect(ProjectRequestUpdateSchema.safeParse({ status: 'won' }).success).toBe(true);
  });

  it('rejects notes past the maximum', () => {
    const result = ProjectRequestUpdateSchema.safeParse({
      status: 'won',
      notes: 'ا'.repeat(2001),
    });

    expect(result.success).toBe(false);
  });
});
