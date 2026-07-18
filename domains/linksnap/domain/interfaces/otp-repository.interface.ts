export interface OtpRecord {
  id: string;
  email: string;
  otpHash: string;
  salt: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface OtpRepository {
  create(email: string, otpHash: string, salt: string, expiresAt: Date): Promise<OtpRecord>;
  findLatestByEmail(email: string): Promise<OtpRecord | null>;
  incrementAttempts(id: string): Promise<void>;
  markVerified(id: string): Promise<void>;
  invalidatePrevious(email: string): Promise<void>;
}
