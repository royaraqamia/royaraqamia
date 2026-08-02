import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAdminEmails, AdminValidator } from '@/shared/admin-validator';

describe('getAdminEmails', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an empty array when the env var is missing', () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    expect(getAdminEmails()).toEqual([]);
  });

  it('parses a comma-separated list, trims and lowercases', () => {
    vi.stubEnv('ADMIN_EMAILS', 'Admin@Example.com, admin2@example.com ,  ADMIN3@example.com');
    expect(getAdminEmails()).toEqual([
      'admin@example.com',
      'admin2@example.com',
      'admin3@example.com',
    ]);
  });

  it('filters out empty entries', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com,,,   ,other@example.com');
    expect(getAdminEmails()).toEqual(['admin@example.com', 'other@example.com']);
  });
});

describe('AdminValidator.isAdmin', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false for empty/whitespace email', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    expect(AdminValidator.isAdmin('')).toBe(false);
    expect(AdminValidator.isAdmin('   ')).toBe(false);
  });

  it('returns false when the allowlist is empty (fail closed)', () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    expect(AdminValidator.isAdmin('admin@example.com')).toBe(false);
  });

  it('returns true when the email is in the allowlist (case-insensitive)', () => {
    vi.stubEnv('ADMIN_EMAILS', 'Admin@Example.com');
    expect(AdminValidator.isAdmin('admin@example.com')).toBe(true);
    expect(AdminValidator.isAdmin('  ADMIN@EXAMPLE.COM  ')).toBe(true);
  });

  it('returns false when the email is not in the allowlist', () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    expect(AdminValidator.isAdmin('user@example.com')).toBe(false);
  });

  it('returns false when multiple admins are listed but email is not one of them', () => {
    vi.stubEnv('ADMIN_EMAILS', 'a@example.com, b@example.com');
    expect(AdminValidator.isAdmin('c@example.com')).toBe(false);
  });
});
