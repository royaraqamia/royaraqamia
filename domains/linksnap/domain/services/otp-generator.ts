import { randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';

export class OtpGenerator {
  static generate(): string {
    const max = 1_000_000;
    const limit = 16_000_000; // largest multiple of 1_000_000 below 2^24

    while (true) {
      const num24 = randomBytes(3).readUIntBE(0, 3);
      if (num24 >= limit) continue;
      const num = num24 % max;
      return num.toString().padStart(6, '0');
    }
  }

  static generateSalt(): string {
    return randomBytes(16).toString('hex');
  }

  static hash(otp: string, salt?: string): string {
    return scryptSync(otp, salt ?? '', 32).toString('hex');
  }

  static verify(otp: string, hash: string, salt?: string): boolean {
    const otpHash = this.hash(otp, salt);
    const otpBuf = Buffer.from(otpHash, 'utf8');
    const hashBuf = Buffer.from(hash, 'utf8');
    if (otpBuf.length !== hashBuf.length) return false;
    return timingSafeEqual(otpBuf, hashBuf);
  }
}
