import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '@/backend/config/env';

/**
 * Token crypto helpers for the MCP OAuth stores.
 *
 * Opaque bearer tokens are never stored raw: only SHA-256 digests persist, so a
 * database leak cannot be replayed as credentials. The user's Supabase refresh
 * token (used to build a user-scoped data client) is the one piece of plaintext
 * we must persist between refreshes — it is encrypted at rest with AES-256-GCM
 * under `MCP_TOKEN_ENCRYPTION_KEY` (32 raw bytes, hex-encoded in env).
 */

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function encryptSecret(plaintext: string): string {
  const key = requireEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const key = requireEncryptionKey();
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function requireEncryptionKey(): Buffer {
  const raw = env.mcpTokenEncryptionKey;
  if (!raw) {
    throw new Error('Missing env var: MCP_TOKEN_ENCRYPTION_KEY (32 bytes, hex-encoded)');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('MCP_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars)');
  }
  return key;
}
