export interface PasswordResetTokenRecord {
  id: string;
  tokenHash: string;
  salt: string;
  expiresAt: Date;
  usedAt: Date | null;
  userId: string;
  email: string;
}

export interface PasswordResetTokenRepository {
  createToken(input: {
    email: string;
    userId: string;
    tokenHash: string;
    salt: string;
    expiresAt: Date;
  }): Promise<void>;
  findLatestValidToken(email: string): Promise<PasswordResetTokenRecord | null>;
  markTokenAsUsed(id: string): Promise<void>;
}
