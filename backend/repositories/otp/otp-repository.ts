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
  /**
   * Atomically increments the attempt counter only when it still equals
   * `currentAttempts` (compare-and-swap). Resolves to `true` when the
   * increment landed, `false` when a concurrent writer changed it first —
   * guaranteeing no failed verification attempt is ever lost.
   */
  incrementOtpAttempts(id: string, currentAttempts: number): Promise<boolean>;
  markOtpVerified(id: string): Promise<void>;
}
