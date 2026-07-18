import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function generateOtp(): string {
  const bytes = randomBytes(3);
  const num = bytes.readUIntBE(0, 3);
  return String(num % 1_000_000).padStart(6, '0');
}

export function hashOtp(otp: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(otp, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyOtp(input: string, storedHash: string, salt: string): boolean {
  const inputHash = scryptSync(input, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(storedHash, 'hex'));
}
