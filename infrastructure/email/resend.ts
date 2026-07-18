import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, otp: string) {
  await resend.emails.send({
    from: `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`,
    to: email,
    subject: 'رمز التحقق - رؤية رقمية',
    html: `
      <div dir="rtl" style="font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #0f172a; color: #f5f5f5;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #c4b5fd; font-size: 24px; margin: 0;">رؤية رقمية</h1>
        </div>
        <div style="background: rgba(255,255,255,0.05); border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.1);">
          <h2 style="color: #f5f5f5; font-size: 18px; margin: 0 0 16px;">رمز التحقق</h2>
          <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 24px;">استخدم هذا الرمز لإكمال عملية التحقق:</p>
          <div style="text-align: center; padding: 20px; background: rgba(119, 102, 238, 0.1); border-radius: 12px; border: 1px solid rgba(119, 102, 238, 0.3);">
            <span style="font-size: 32px; font-weight: bold; color: #c4b5fd; letter-spacing: 8px;">${otp}</span>
          </div>
          <p style="color: #71717a; font-size: 12px; margin: 24px 0 0; text-align: center;">صالح لمدة 5 دقائق</p>
        </div>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  await resend.emails.send({
    from: `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`,
    to: email,
    subject: 'إعادة تعيين كلمة المرور - رؤية رقمية',
    html: `
      <div dir="rtl" style="font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #0f172a; color: #f5f5f5;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #c4b5fd; font-size: 24px; margin: 0;">رؤية رقمية</h1>
        </div>
        <div style="background: rgba(255,255,255,0.05); border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.1);">
          <h2 style="color: #f5f5f5; font-size: 18px; margin: 0 0 16px;">إعادة تعيين كلمة المرور</h2>
          <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 24px;">اضغط على الزر أدناه لإعادة تعيين كلمة المرور:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #7766ee, #6366f1); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">إعادة التعيين</a>
          </div>
          <p style="color: #71717a; font-size: 12px; margin: 24px 0 0; text-align: center;">صالح لمدة ساعة</p>
        </div>
      </div>
    `,
  });
}
