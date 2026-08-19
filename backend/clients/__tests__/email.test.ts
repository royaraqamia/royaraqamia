import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
const mockBatchSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return {
      emails: { send: (...args: unknown[]) => mockSend(...args) },
      batch: { send: (...args: unknown[]) => mockBatchSend(...args) },
    };
  }),
}));

import { Resend } from 'resend';
import {
  ResendEmailClient,
  createEmailClient,
  type EmailSender,
  type EmailValidity,
} from '@/backend/clients/email';

function makeResend(): Resend {
  return new (Resend as unknown as new () => Resend)();
}

function makeSender(): EmailSender {
  return { fromName: 'رؤية رقمية', fromEmail: 'no-reply@royaraqamia.com' };
}

function makeValidity(): EmailValidity {
  return { otpMinutes: 5, passwordResetHours: 1 };
}

describe('ResendEmailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendOtpEmail sends to the right recipient with the OTP embedded', async () => {
    mockSend.mockResolvedValue({ id: 'email-1' });
    const client = new ResendEmailClient(makeResend(), makeSender(), makeValidity());

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
    expect(String(payload.html)).toContain('5 دقائق');
  });

  it('sendPasswordResetEmail embeds the reset URL', async () => {
    mockSend.mockResolvedValue({ id: 'email-2' });
    const client = new ResendEmailClient(makeResend(), makeSender(), makeValidity());

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
    expect(String(payload.html)).toContain('ساعة');
  });

  it('uses the configured sender in the from field', async () => {
    mockSend.mockResolvedValue({ id: 'email-3' });
    const client = new ResendEmailClient(
      makeResend(),
      {
        fromName: 'Custom Sender',
        fromEmail: 'custom@example.com',
      },
      makeValidity()
    );

    await client.sendOtpEmail('a@b.com', '000000');

    const [payload] = mockSend.mock.calls[0] as [Record<string, unknown>];
    expect(payload.from).toBe('Custom Sender <custom@example.com>');
  });

  it('createEmailClient returns a working client', async () => {
    mockSend.mockResolvedValue({ id: 'email-4' });
    const client = createEmailClient(makeResend(), makeSender(), makeValidity());
    await client.sendOtpEmail('a@b.com', '000000');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('sendBroadcastEmails sends every recipient in one batch', async () => {
    mockBatchSend.mockResolvedValue({
      data: { data: [{ id: 'b1' }, { id: 'b2' }], errors: [] },
      error: null,
    });
    const client = new ResendEmailClient(makeResend(), makeSender(), makeValidity());

    const sent = await client.sendBroadcastEmails([
      { email: 'a@example.com', subject: 'تحديث جديد', body: 'مرحباً' },
      { email: 'b@example.com', subject: 'تحديث جديد', body: 'مرحباً' },
    ]);

    expect(sent).toBe(2);
    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    const [payload] = mockBatchSend.mock.calls[0] as [Record<string, unknown>[]];
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      from: 'رؤية رقمية <no-reply@royaraqamia.com>',
      to: 'a@example.com',
      subject: '[رؤية رقمية] تحديث جديد',
    });
    const first = payload[0] as Record<string, unknown>;
    expect(first.html).toContain('dir="rtl"');
    expect(first.html).toContain('مرحباً');
    expect(first.html).toContain('تحديث جديد');
  });

  it('sendBroadcastEmails chunks recipients into batches of 100', async () => {
    mockBatchSend.mockImplementation((payload: Record<string, unknown>[]) =>
      Promise.resolve({
        data: { data: payload.map(() => ({ id: 'x' })), errors: [] },
        error: null,
      })
    );
    const client = new ResendEmailClient(makeResend(), makeSender(), makeValidity());
    const recipients = Array.from({ length: 250 }, (_, i) => ({
      email: `u${i}@example.com`,
      subject: 'تحديث',
    }));

    const sent = await client.sendBroadcastEmails(recipients);

    expect(sent).toBe(250);
    expect(mockBatchSend).toHaveBeenCalledTimes(3);
    const sizes = mockBatchSend.mock.calls.map(
      ([payload]) => (payload as Record<string, unknown>[]).length
    );
    expect(sizes).toEqual([100, 100, 50]);
    const [, options] = mockBatchSend.mock.calls[0] as [
      Record<string, unknown>[],
      { batchValidation: string },
    ];
    expect(options.batchValidation).toBe('permissive');
  });

  it('sendBroadcastEmails counts only successfully queued emails in a permissive batch', async () => {
    mockBatchSend.mockResolvedValue({
      data: {
        data: [{ id: 'ok-1' }, { id: 'ok-2' }],
        errors: [{ index: 2, message: 'invalid email' }],
      },
      error: null,
    });
    const client = new ResendEmailClient(makeResend(), makeSender(), makeValidity());

    const sent = await client.sendBroadcastEmails([
      { email: 'a@example.com', subject: 'تحديث' },
      { email: 'b@example.com', subject: 'تحديث' },
      { email: 'bad-address', subject: 'تحديث' },
    ]);

    expect(sent).toBe(2);
  });

  it('sendBroadcastEmails returns 0 for an empty list without calling Resend', async () => {
    const client = new ResendEmailClient(makeResend(), makeSender(), makeValidity());

    const sent = await client.sendBroadcastEmails([]);

    expect(sent).toBe(0);
    expect(mockBatchSend).not.toHaveBeenCalled();
  });

  it('sendBroadcastEmails escapes HTML in subject and body', async () => {
    mockBatchSend.mockResolvedValue({
      data: { data: [{ id: 'b1' }], errors: [] },
      error: null,
    });
    const client = new ResendEmailClient(makeResend(), makeSender(), makeValidity());

    await client.sendBroadcastEmails([
      { email: 'a@example.com', subject: '<b>خبر</b>', body: '<script>alert(1)</script>' },
    ]);

    const [payload] = mockBatchSend.mock.calls[0] as [Record<string, unknown>[]];
    const first = payload[0] as Record<string, unknown>;
    expect(String(first.html)).toContain('&lt;b&gt;');
    expect(String(first.html)).not.toContain('<script>');
  });
});
