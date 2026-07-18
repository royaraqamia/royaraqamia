import { OtpGenerator } from '../../domain/services/otp-generator';
import { OtpRepository } from '../../domain/interfaces/otp-repository.interface';
import { sendOtpEmail } from '../../infrastructure/email/resend.client';
import { OTP_TTL_MS } from '../../domain/services/otp-config';

export class SendOtpUseCase {
  constructor(private readonly otpRepository: OtpRepository) {}

  async execute(email: string): Promise<void> {
    const code = OtpGenerator.generate();
    const salt = OtpGenerator.generateSalt();
    const hash = OtpGenerator.hash(code, salt);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.otpRepository.invalidatePrevious(email);
    await this.otpRepository.create(email, hash, salt, expiresAt);
    await sendOtpEmail(email, code);
  }
}
