import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function generateOtp(): string {
  const range = 1_000_000;
  const maxUnbiased = Math.floor(0x1000000 / range) * range; // 16,000,000

  while (true) {
    const bytes = randomBytes(3);
    const num = bytes.readUIntBE(0, 3);
    if (num < maxUnbiased) {
      return String(num % range).padStart(6, '0');
    }
  }
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
