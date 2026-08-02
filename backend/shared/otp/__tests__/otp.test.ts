import { describe, it, expect } from 'vitest';
import { generateOtp, hashOtp, verifyOtp } from '@/backend/shared/otp/generator';
import { OTP_CONFIG } from '@/backend/config/otp';

describe('OTP Generator', () => {
  describe('generateOtp', () => {
    it('returns a 6-digit string', () => {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('returns different values on successive calls', () => {
      const otp1 = generateOtp();
      const otp2 = generateOtp();
      expect(otp1).not.toBe(otp2);
    });

    it('produces values across the full range (0–999999)', () => {
      const seen = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        seen.add(Number(generateOtp()));
      }
      expect(seen.size).toBeGreaterThan(900);
    });

    it('returns leading zeros when value < 100000', () => {
      const values = Array.from({ length: 500 }, () => generateOtp());
      const hasLeadingZero = values.some((v) => v.startsWith('0'));
      expect(hasLeadingZero).toBe(true);
    });
  });

  describe('hashOtp and verifyOtp', () => {
    it('returns hash and salt', () => {
      const result = hashOtp('123456');
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('salt');
      expect(result.hash).toBeTruthy();
      expect(result.salt).toBeTruthy();
      expect(typeof result.hash).toBe('string');
      expect(typeof result.salt).toBe('string');
    });

    it('verifies the correct OTP', () => {
      const otp = generateOtp();
      const { hash, salt } = hashOtp(otp);
      expect(verifyOtp(otp, hash, salt)).toBe(true);
    });

    it('rejects an incorrect OTP', () => {
      const { hash, salt } = hashOtp('123456');
      expect(verifyOtp('654321', hash, salt)).toBe(false);
    });

    it('rejects empty string', () => {
      const { hash, salt } = hashOtp('123456');
      expect(verifyOtp('', hash, salt)).toBe(false);
    });

    it('produces different hashes for the same OTP with different salts', () => {
      const otp = '000000';
      const result1 = hashOtp(otp);
      const result2 = hashOtp(otp);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('returns a 128-char hex hash (64 bytes)', () => {
      const { hash } = hashOtp(generateOtp());
      expect(hash).toHaveLength(128);
    });

    it('returns a 32-char hex salt (16 bytes)', () => {
      const { salt } = hashOtp(generateOtp());
      expect(salt).toHaveLength(32);
    });
  });

  describe('OTP_CONFIG', () => {
    it('has expected configuration values', () => {
      expect(OTP_CONFIG.LENGTH).toBe(6);
      expect(OTP_CONFIG.TTL_MINUTES).toBe(5);
      expect(OTP_CONFIG.MAX_ATTEMPTS).toBe(5);
      expect(OTP_CONFIG.RESEND_COOLDOWN_SECONDS).toBe(60);
    });
  });
});
