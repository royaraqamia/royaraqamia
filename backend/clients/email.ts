import { Resend } from 'resend';

const EMAIL_BATCH_SIZE = 100;

const palette = {
  canvas: '#ECEDF5',
  paper: '#F6F7FB',
  ink: '#1C1A36',
  violet: '#6C3DF2',
  violetSoft: '#EDEAFC',
  muted: '#5D5A75',
  hairline: '#E1DEF2',
};

const FONT_FAMILY = "'IBM Plex Sans Arabic'";

export interface EmailSender {
  fromName: string;
  fromEmail: string;
}

export interface BroadcastEmailRecipient {
  email: string;
  subject: string;
  body?: string;
}

export interface EmailClient {
  sendOtpEmail(email: string, otp: string): Promise<void>;
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
  sendBroadcastEmails(recipients: BroadcastEmailRecipient[]): Promise<number>;
}

export interface EmailValidity {
  otpMinutes: number;
  passwordResetHours: number;
}

function formatMinutes(minutes: number): string {
  return minutes === 1 ? 'دقيقة' : `${minutes} دقائق`;
}

function formatHours(hours: number): string {
  return hours === 1 ? 'ساعة' : `${hours} ساعات`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function eyebrow(text: string): string {
  return `<div style="font-size:12px;font-weight:600;color:${palette.violet};margin-bottom:6px;">${text}</div>`;
}

function heading(text: string): string {
  return `<div style="font-family:${FONT_FAMILY};font-weight:700;font-size:22px;line-height:1.4;color:${palette.ink};">${text}</div>`;
}

function paragraph(text: string): string {
  return `<p style="margin:14px 0 0;font-size:15px;line-height:1.8;color:${palette.ink};">${text}</p>`;
}

function cardFooter(footnote: string): string {
  return `
    <div style="border-top:1px solid ${palette.hairline};padding:18px 24px 20px;text-align:center;font-size:12px;color:${palette.muted};">
      <span>${footnote}</span>
    </div>`;
}

function preheader(text: string): string {
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${text}&nbsp;</div>`;
}

function layout(content: string, preheaderText?: string): string {
  const preheaderHtml = preheaderText ? preheader(preheaderText) : '';
  return `
    <div dir="rtl" lang="ar" style="margin:0;padding:0;background-color:${palette.canvas};">
      ${preheaderHtml}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.canvas}" style="background-color:${palette.canvas};">
        <tr>
          <td align="center" bgcolor="${palette.canvas}" style="padding:40px 16px;background-color:${palette.canvas};">
            <div style="max-width:600px;width:100%;margin:0 auto;background-color:${palette.paper};border:1px solid ${palette.hairline};border-radius:16px;overflow:hidden;font-family:${FONT_FAMILY};color:${palette.ink};">
              ${content}
            </div>
          </td>
        </tr>
      </table>
    </div>`;
}

export class ResendEmailClient implements EmailClient {
  constructor(
    private readonly resend: Resend,
    private readonly sender: EmailSender,
    private readonly validity: EmailValidity
  ) {}

  async sendOtpEmail(email: string, otp: string): Promise<void> {
    await this.resend.emails.send({
      from: `${this.sender.fromName} <${this.sender.fromEmail}>`,
      to: email,
      subject: 'رمز التَّحقُّق - رؤية رقمية',
      html: layout(
        `
        <div style="padding:32px 32px 32px;">
          ${eyebrow('التَّحقُّق')}
          ${heading('رمز التَّحقُّق')}
          ${paragraph('أدخِل هذا الرَّمز في صفحة تسجيل الدُّخول لإكمال التَّحقُّق من هويَّتك.')}
          <div style="text-align:center;margin:24px 0 0;padding:18px 16px;background-color:${palette.violetSoft};border:1px solid ${palette.hairline};border-radius:12px;">
            <div style="direction:ltr;font-family:${FONT_FAMILY};font-size:30px;font-weight:700;color:${palette.violet};letter-spacing:10px;">${escapeHtml(otp)}</div>
          </div>
          <p style="margin:16px 0 0;font-size:12px;color:${palette.muted};text-align:center;">لا تُشارِك هذا الرَّمز مع أي شخص.</p>
        </div>
        ${cardFooter(`صالح لمدَّة ${formatMinutes(this.validity.otpMinutes)}`)}
      `,
        'رمز التحقق - أدخل الرمز لإكمال التحقق'
      ),
    });
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const safeResetUrl = escapeHtml(resetUrl);
    await this.resend.emails.send({
      from: `${this.sender.fromName} <${this.sender.fromEmail}>`,
      to: email,
      subject: 'إعادة تعيين كلمة المرور - رؤية رقمية',
      html: layout(
        `
        <div style="padding:32px 32px 32px;">
          ${eyebrow('الأمان')}
          ${heading('إعادة تعيين كلمة المرور')}
          ${paragraph('اضغط الزِّر أدناه لاختيار كلمة مرور جديدة لحسابك.')}
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${safeResetUrl}" style="display:inline-block;background-color:${palette.violet};color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:600;font-size:15px;">اختيار كلمة مرور جديدة</a>
          </div>
          <div style="text-align:center;margin:16px 0 0;font-size:12px;color:${palette.muted};">
            إن لم يعمل الزِّر، انسخ الرَّابط وافتحه في المُتصفِّح:
            <div style="margin-top:6px;direction:ltr;font-family:${FONT_FAMILY};"><a href="${safeResetUrl}" style="color:${palette.muted};word-break:break-all;">${safeResetUrl}</a></div>
          </div>
        </div>
        ${cardFooter(`الرَّابط صالح لمدَّة ${formatHours(this.validity.passwordResetHours)}`)}
      `,
        'اختر كلمة مرور جديدة لحسابك'
      ),
    });
  }

  private broadcastEmailHtml(subject: string, body?: string): string {
    const title = escapeHtml(subject);
    const content = body
      ? `<div style="margin:14px 0 0;font-size:15px;line-height:1.8;color:${palette.ink};">${escapeHtml(body).replace(/\r?\n/g, '<br>')}</div>`
      : '';
    return layout(
      `
      <div style="padding:32px 32px 32px;">
        ${heading(title)}
        ${content}
      </div>
    `,
      title
    );
  }

  async sendBroadcastEmails(recipients: BroadcastEmailRecipient[]): Promise<number> {
    if (recipients.length === 0) return 0;
    let sent = 0;
    for (const batch of chunk(recipients, EMAIL_BATCH_SIZE)) {
      const result = await this.resend.batch.send(
        batch.map((recipient) => ({
          from: `${this.sender.fromName} <${this.sender.fromEmail}>`,
          to: recipient.email,
          subject: `[رؤية رقمية] ${recipient.subject}`,
          html: this.broadcastEmailHtml(recipient.subject, recipient.body),
        })),
        { batchValidation: 'permissive' }
      );
      if (result.error) {
        throw new Error(result.error.message);
      }
      sent += result.data?.data.length ?? 0;
    }
    return sent;
  }
}

export function createEmailClient(
  resend: Resend,
  sender: EmailSender,
  validity: EmailValidity
): EmailClient {
  return new ResendEmailClient(resend, sender, validity);
}
