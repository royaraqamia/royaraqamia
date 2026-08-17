import { describe, it, expect } from 'vitest';
import { UserIdsSchema, AdminUsersSearchSchema } from '@/shared/contracts/users';

const uuid = '9f0d8b3e-6b2a-4d4c-9f1e-2c3d4e5f6a7b';

describe('UserIdsSchema', () => {
  it('accepts an array of valid uuids', () => {
    expect(UserIdsSchema.safeParse([uuid]).success).toBe(true);
  });

  it('accepts an empty array', () => {
    expect(UserIdsSchema.safeParse([]).success).toBe(true);
  });

  it('rejects a non-uuid entry', () => {
    const result = UserIdsSchema.safeParse(['not-a-uuid']);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('معرّف مستخدم غير صالح');
  });

  it('rejects more than 50 ids', () => {
    const many = Array.from({ length: 51 }, () => uuid);
    const result = UserIdsSchema.safeParse(many);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('الحد الأقصى 50 مستخدم');
  });

  it('accepts exactly 50 ids (boundary)', () => {
    const many = Array.from({ length: 50 }, () => uuid);
    expect(UserIdsSchema.safeParse(many).success).toBe(true);
  });
});

describe('AdminUsersSearchSchema', () => {
  it('defaults the limit to 50', () => {
    const result = AdminUsersSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.limit).toBe(50);
  });

  it('coerces a string limit', () => {
    const result = AdminUsersSearchSchema.safeParse({ limit: '10' });
    expect(result.success).toBe(true);
    expect(result.data?.limit).toBe(10);
  });

  it('rejects a limit over 50', () => {
    expect(AdminUsersSearchSchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('trims the search term', () => {
    const result = AdminUsersSearchSchema.safeParse({ search: '  أحمد  ' });
    expect(result.success).toBe(true);
    expect(result.data?.search).toBe('أحمد');
  });
});
