import { describe, it, expect } from 'vitest';
import { parseAdminEmails, AdminValidator } from '@/shared/admin-validator';

describe('parseAdminEmails', () => {
  it('returns an empty array when the input is empty', () => {
    expect(parseAdminEmails('')).toEqual([]);
  });

  it('parses a comma-separated list, trims and lowercases', () => {
    expect(parseAdminEmails('Admin@Example.com, admin2@example.com ,  ADMIN3@example.com')).toEqual(
      ['admin@example.com', 'admin2@example.com', 'admin3@example.com']
    );
  });

  it('filters out empty entries', () => {
    expect(parseAdminEmails('admin@example.com,,,   ,other@example.com')).toEqual([
      'admin@example.com',
      'other@example.com',
    ]);
  });
});

describe('AdminValidator.isAdmin', () => {
  const adminEmails = ['admin@example.com'];

  it('returns false for empty/whitespace email', () => {
    expect(AdminValidator.isAdmin('', adminEmails)).toBe(false);
    expect(AdminValidator.isAdmin('   ', adminEmails)).toBe(false);
  });

  it('returns false when the allowlist is empty (fail closed)', () => {
    expect(AdminValidator.isAdmin('admin@example.com', [])).toBe(false);
  });

  it('returns true when the email is in the allowlist (case-insensitive)', () => {
    expect(AdminValidator.isAdmin('admin@example.com', ['Admin@Example.com'])).toBe(true);
    expect(AdminValidator.isAdmin('  ADMIN@EXAMPLE.COM  ', ['admin@example.com'])).toBe(true);
  });

  it('returns false when the email is not in the allowlist', () => {
    expect(AdminValidator.isAdmin('user@example.com', adminEmails)).toBe(false);
  });

  it('returns false when multiple admins are listed but email is not one of them', () => {
    expect(AdminValidator.isAdmin('c@example.com', ['a@example.com', 'b@example.com'])).toBe(false);
  });
});
