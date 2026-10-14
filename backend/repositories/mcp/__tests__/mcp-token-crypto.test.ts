import { describe, it, expect } from 'vitest';
import {
  hashToken,
  generateOpaqueToken,
  encryptSecret,
  decryptSecret,
  encryptBridgeSession,
  readBridgeSession,
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

/**
 * The ownership marker. Only a session this repo minted may be signed out when a
 * grant is revoked, so every ciphertext the mint path writes carries a marker
 * inside it, and a row written before ADR 0023's amendment reads as borrowed.
 */
describe('encryptBridgeSession / readBridgeSession', () => {
  it('round-trips a minted session and marks it ours', () => {
    const session = readBridgeSession(encryptBridgeSession('bridge-refresh-token'));

    expect(session).toEqual({ refreshToken: 'bridge-refresh-token', owned: true });
  });

  it('reads a pre-amendment ciphertext as borrowed, token intact', () => {
    // Rows written before the amendment hold a copy of the *browser* session,
    // encrypted without a marker. They must still drain as a working bridge —
    // they just must never be revoked.
    expect(readBridgeSession(encryptSecret('browser-refresh-token'))).toEqual({
      refreshToken: 'browser-refresh-token',
      owned: false,
    });
  });

  it('keeps the marker off the ciphertext itself', () => {
    const encrypted = encryptBridgeSession('bridge-refresh-token');

    expect(encrypted).not.toContain('mcp-bridge');
    expect(encrypted).not.toContain('bridge-refresh-token');
  });

  it('only reads a marker that was inside an authenticated ciphertext', () => {
    // The marker is plaintext *inside* the AES-GCM payload, so a marker written
    // on the outside is not a marker at all: it does not decrypt.
    expect(() => readBridgeSession('mcp-bridge:1:stolen-token')).toThrow();
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
