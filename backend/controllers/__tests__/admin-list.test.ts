import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  createStatusGuard,
  normalizePage,
  normalizePageSize,
  parseAdminListQuery,
} from '@/backend/controllers/admin-list';

const STATUSES = ['new', 'contacted'] as const;
const isStatus = createStatusGuard(STATUSES);

describe('normalizePage', () => {
  it('floors a fractional page', () => {
    expect(normalizePage(2.9)).toBe(2);
  });

  it('falls back to page 1 for a non-positive or unusable value', () => {
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage(-4)).toBe(1);
    expect(normalizePage(Number.NaN)).toBe(1);
    expect(normalizePage(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('normalizePageSize', () => {
  it('defaults an unusable size', () => {
    expect(normalizePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('clamps a hostile size', () => {
    expect(normalizePageSize(100000)).toBe(MAX_PAGE_SIZE);
  });

  it('floors a fractional size', () => {
    expect(normalizePageSize(10.7)).toBe(10);
  });
});

describe('createStatusGuard', () => {
  it('accepts a member and rejects a stranger', () => {
    expect(isStatus('new')).toBe(true);
    expect(isStatus('archived')).toBe(false);
  });
});

describe('parseAdminListQuery', () => {
  it('normalises the page and page size', () => {
    expect(parseAdminListQuery(0, 100000, null, null, isStatus)).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      status: undefined,
      search: undefined,
    });
  });

  it('keeps a known status and drops an unknown one', () => {
    expect(parseAdminListQuery(1, 20, 'new', null, isStatus).status).toBe('new');
    expect(parseAdminListQuery(1, 20, 'archived', null, isStatus).status).toBeUndefined();
  });

  it('trims a search term and drops a blank one', () => {
    expect(parseAdminListQuery(1, 20, null, '  PRJ-2026  ', isStatus).search).toBe('PRJ-2026');
    expect(parseAdminListQuery(1, 20, null, '   ', isStatus).search).toBeUndefined();
  });
});
