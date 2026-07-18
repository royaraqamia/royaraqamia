import { Resend } from 'resend';

interface OtpEmailParams {
  email: string;
  otp: string;
}

let resendInstance: Resend | null = null;

function getResendClient(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set.');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

function getFromEmail(): string {
  const email = process.env.RESEND_FROM_EMAIL;
  if (!email) {
    throw new Error('RESEND_FROM_EMAIL environment variable is not set.');
  }
  const name = process.env.RESEND_FROM_NAME;
  return name ? `${name} <${email}>` : email;
}

export async function sendOtpEmail({ email, otp }: OtpEmailParams): Promise<void> {
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: getFromEmail(),
    to: email,
    subject: 'رمز التَّحقُّق الخاص بك - HabitFlow',
    html: `
      <div dir="rtl" style="font-family: 'IBM Plex Sans Arabic', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h1 style="font-size: 22px; color: #1e1e2f; margin-bottom: 8px;">رمز التَّحقُّق من البريد الإلكتروني</h1>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          استخدم الرَّمز أدناه للتَّحقُّق من بريدك الإلكتروني في HabitFlow. الرَّمز صالح لمدَّة 5 دقائق.
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; direction: ltr; unicode-bidi: bidi-override;">${otp}</span>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">
          إذا لم تطلب هذا الرَّمز، يمكنك تجاهل هذه الرِّسالة.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
}
