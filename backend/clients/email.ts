import { Resend } from 'resend';

const baseStyle = `font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #0f172a; color: #f5f5f5;`;

export interface EmailSender {
  fromName: string;
  fromEmail: string;
}

export interface EmailClient {
  sendOtpEmail(email: string, otp: string): Promise<void>;
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>;
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
      html: `
          <div dir="rtl" style="${baseStyle}">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #c4b5fd; font-size: 24px; margin: 0;">رؤية رقمية</h1>
            </div>
            <div style="background: rgba(255,255,255,0.05); border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.1);">
              <h2 style="color: #f5f5f5; font-size: 18px; margin: 0 0 16px;">رمز التَّحقُّق</h2>
              <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 24px;">استخدم هذا الرَّمز لإكمال عمليَّة التَّحقُّق:</p>
              <div style="text-align: center; padding: 20px; background: rgba(119, 102, 238, 0.1); border-radius: 12px; border: 1px solid rgba(119, 102, 238, 0.3);">
                <span style="font-size: 32px; font-weight: bold; color: #c4b5fd; letter-spacing: 8px;">${otp}</span>
              </div>
              <p style="color: #71717a; font-size: 12px; margin: 24px 0 0; text-align: center;">صالح لمدَّة ${formatMinutes(this.validity.otpMinutes)}</p>
            </div>
          </div>
        `,
    });
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    await this.resend.emails.send({
      from: `${this.sender.fromName} <${this.sender.fromEmail}>`,
      to: email,
      subject: 'إعادة تعيين كلمة المرور - رؤية رقمية',
      html: `
          <div dir="rtl" style="${baseStyle}">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #c4b5fd; font-size: 24px; margin: 0;">رؤية رقمية</h1>
            </div>
            <div style="background: rgba(255,255,255,0.05); border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.1);">
              <h2 style="color: #f5f5f5; font-size: 18px; margin: 0 0 16px;">إعادة تعيين كلمة المرور</h2>
              <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 24px;">اضغط على الزِّر أدناه لإعادة تعيين كلمة المرور:</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #7766ee, #6366f1); color: white; text-decoration: none; border-radius: 9999px; font-weight: bold;">إعادة التعيين</a>
              </div>
              <p style="color: #71717a; font-size: 12px; margin: 24px 0 0; text-align: center;">صالح لمدَّة ${formatHours(this.validity.passwordResetHours)}</p>
            </div>
          </div>
        `,
    });
  }
}

export function createEmailClient(
  resend: Resend,
  sender: EmailSender,
  validity: EmailValidity
): EmailClient {
  return new ResendEmailClient(resend, sender, validity);
}
