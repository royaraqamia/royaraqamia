import { describe, it, expect } from 'vitest';
import {
  LoginSchema,
  SignupSchema,
  OtpSchema,
  ResetPasswordSchema,
  UpdatePasswordSchema,
} from '@/lib/schemas';

describe('LoginSchema', () => {
  it('accepts valid email and password', () => {
    const result = LoginSchema.safeParse({ email: 'test@example.com', password: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'abc123' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('البريد الإلكتروني غير صحيح');
  });

  it('rejects password shorter than 6 characters', () => {
    const result = LoginSchema.safeParse({ email: 'test@example.com', password: '12345' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('6');
  });

  it('rejects empty email', () => {
    const result = LoginSchema.safeParse({ email: '', password: 'abc123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = LoginSchema.safeParse({ email: 'test@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('SignupSchema', () => {
  it('accepts valid name, email and strong password', () => {
    const result = SignupSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'StrongP@ss1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short name', () => {
    const result = SignupSchema.safeParse({
      name: 'A',
      email: 'test@example.com',
      password: 'StrongP@ss1',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('حرفين');
  });

  it('rejects password without uppercase letter', () => {
    const result = SignupSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'weakp@ss1',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('حرف كبير');
  });

  it('rejects password without number', () => {
    const result = SignupSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'WeakP@sss',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('رقم');
  });

  it('rejects password without special character', () => {
    const result = SignupSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'WeakPass1',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('رمز خاص');
  });

  it('rejects password shorter than 8 characters', () => {
    const result = SignupSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Sh0rt!',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('8');
  });

  it('rejects invalid email in signup', () => {
    const result = SignupSchema.safeParse({
      name: 'Test User',
      email: 'bad-email',
      password: 'StrongP@ss1',
    });
    expect(result.success).toBe(false);
  });
});

describe('OtpSchema', () => {
  it('accepts exactly 6 digits', () => {
    const result = OtpSchema.safeParse({ otp: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects less than 6 characters', () => {
    const result = OtpSchema.safeParse({ otp: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects more than 6 characters', () => {
    const result = OtpSchema.safeParse({ otp: '1234567' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = OtpSchema.safeParse({ otp: '' });
    expect(result.success).toBe(false);
  });
});

describe('ResetPasswordSchema', () => {
  it('accepts valid email', () => {
    const result = ResetPasswordSchema.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = ResetPasswordSchema.safeParse({ email: 'not-email' });
    expect(result.success).toBe(false);
  });
});

describe('UpdatePasswordSchema', () => {
  it('accepts strong password', () => {
    const result = UpdatePasswordSchema.safeParse({ password: 'StrongP@ss1' });
    expect(result.success).toBe(true);
  });

  it('rejects weak password without uppercase', () => {
    const result = UpdatePasswordSchema.safeParse({ password: 'weakp@ss1' });
    expect(result.success).toBe(false);
  });

  it('rejects weak password shorter than 8', () => {
    const result = UpdatePasswordSchema.safeParse({ password: 'Abc1@' });
    expect(result.success).toBe(false);
  });
});
