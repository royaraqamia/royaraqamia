import { OtpGenerator } from '../../domain/services/otp-generator';
import { OtpRepository } from '../../domain/interfaces/otp-repository.interface';
import { AuthRepository } from '../../domain/interfaces/auth-repository.interface';

export class VerifyOtpUseCase {
  constructor(
    private readonly otpRepository: OtpRepository,
    private readonly authRepository: AuthRepository
  ) {}

  async execute(email: string, otp: string): Promise<{ userId: string; email: string }> {
    const record = await this.otpRepository.findLatestByEmail(email);

    if (!record) {
      throw new OtpError('not_found', 'لم يتم العثور على رمز تحقق لهذا البريد الإلكتروني.');
    }

    if (record.verifiedAt) {
      throw new OtpError('already_verified', 'تم التحقق من هذا البريد الإلكتروني بالفعل.');
    }

    if (Date.now() > record.expiresAt.getTime()) {
      throw new OtpError('expired', 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.');
    }

    if (record.attempts >= record.maxAttempts) {
      throw new OtpError(
        'too_many_attempts',
        'لقد تجاوزت الحد الأقصى من المحاولات. اطلب رمزًا جديدًا.'
      );
    }

    const isValid = OtpGenerator.verify(otp, record.otpHash, record.salt);
    if (!isValid) {
      await this.otpRepository.incrementAttempts(record.id);
      const remaining = record.maxAttempts - record.attempts - 1;
      throw new OtpError('invalid', `الرمز غير صحيح. لديك ${remaining} محاولة متبقية.`);
    }

    const result = await this.authRepository.confirmUserEmail(email);
    await this.otpRepository.markVerified(record.id);

    return result;
  }
}

export class OtpError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'OtpError';
  }
}
