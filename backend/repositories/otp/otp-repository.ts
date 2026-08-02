export type OtpVerificationResult =
  | { error: string; success?: undefined }
  | { success: true; error?: undefined };

export interface IOtpRepository {
  createOtpRecord(email: string, otpHash: string, salt: string, expiresAt: Date): Promise<void>;
  verifyOtpRecord(email: string, otp: string): Promise<OtpVerificationResult>;
}
