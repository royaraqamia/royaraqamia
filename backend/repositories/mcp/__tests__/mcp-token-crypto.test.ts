import { describe, it, expect } from 'vitest';
import {
  hashToken,
  generateOpaqueToken,
  encryptSecret,
  decryptSecret,
  constantTimeEqual,
} from '../mcp-token-crypto';

process.env.MCP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

describe('hashToken', () => {
  it('produces a 64-char sha256 hex digest', () => {
    expect(hashToken('secret')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and irreversible', () => {
    expect(hashToken('secret')).toBe(hashToken('secret'));
    expect(hashToken('secret')).not.toBe('secret');
  });

  it('digests differ for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('generateOpaqueToken', () => {
  it('generates unique url-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(100);
    expect([...tokens].every((t) => /^[A-Za-z0-9_-]+$/.test(t))).toBe(true);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const secret = 'sb-refresh-token-value';
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it('produces distinct ciphertexts for the same input (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encryptSecret('payload');
    const tampered = encrypted.slice(0, -2) + (encrypted.endsWith('AA') ? 'BB' : 'AA');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws when the key is missing', () => {
    delete process.env.MCP_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(/MCP_TOKEN_ENCRYPTION_KEY/);
    process.env.MCP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  });
});

describe('constantTimeEqual', () => {
  it('compares equal strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
  });

  it('rejects differing strings and lengths', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
