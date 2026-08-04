export interface OtpRecordData {
  id: string;
  otpHash: string;
  salt: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
}

export interface OtpRepository {
  createOtpRecord(input: {
    email: string;
    otpHash: string;
    salt: string;
    expiresAt: Date;
    maxAttempts: number;
  }): Promise<void>;
  findLatestPendingOtp(email: string): Promise<OtpRecordData | null>;
  incrementOtpAttempts(id: string, currentAttempts: number): Promise<void>;
  markOtpVerified(id: string): Promise<void>;
}
