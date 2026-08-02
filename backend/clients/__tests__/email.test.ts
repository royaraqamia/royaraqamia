import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: (...args: unknown[]) => mockSend(...args) } };
  }),
}));

import { Resend } from 'resend';
import { ResendEmailClient, createEmailClient } from '@/backend/clients/email';

function makeResend(): Resend {
  return new (Resend as unknown as new () => Resend)();
}

describe('ResendEmailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_FROM_NAME = 'رؤية رقمية';
    process.env.RESEND_FROM_EMAIL = 'no-reply@royaraqamia.com';
  });

  it('sendOtpEmail sends to the right recipient with the OTP embedded', async () => {
    mockSend.mockResolvedValue({ id: 'email-1' });
    const client = new ResendEmailClient(makeResend());

    await client.sendOtpEmail('user@example.com', '123456');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload] = mockSend.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      from: 'رؤية رقمية <no-reply@royaraqamia.com>',
      to: 'user@example.com',
      subject: 'رمز التَّحقُّق - رؤية رقمية',
    });
    expect(String(payload.html)).toContain('123456');
    expect(String(payload.html)).toContain('dir="rtl"');
  });

  it('sendPasswordResetEmail embeds the reset URL', async () => {
    mockSend.mockResolvedValue({ id: 'email-2' });
    const client = new ResendEmailClient(makeResend());

    await client.sendPasswordResetEmail(
      'user@example.com',
      'https://royaraqamia.com/auth/update-password'
    );

    const [payload] = mockSend.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      to: 'user@example.com',
      subject: 'إعادة تعيين كلمة المرور - رؤية رقمية',
    });
    expect(String(payload.html)).toContain('https://royaraqamia.com/auth/update-password');
  });

  it('createEmailClient returns a working client', async () => {
    mockSend.mockResolvedValue({ id: 'email-3' });
    const client = createEmailClient(makeResend());
    await client.sendOtpEmail('a@b.com', '000000');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
