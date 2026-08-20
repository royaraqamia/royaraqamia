import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';
import {
  basicAuthCredentials,
  oauthErrorRedirect,
  noStore,
} from '@/backend/services/mcp/oauth-http';

describe('basicAuthCredentials', () => {
  it('parses a valid Basic header', () => {
    const encoded = Buffer.from('client-1:secret-1').toString('base64');
    expect(basicAuthCredentials(`Basic ${encoded}`)).toEqual({
      clientId: 'client-1',
      clientSecret: 'secret-1',
    });
  });

  it('returns null for a missing header', () => {
    expect(basicAuthCredentials(null)).toBeNull();
  });

  it('returns null for a non-Basic scheme', () => {
    expect(basicAuthCredentials('Bearer token')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(basicAuthCredentials('Basic !!!not-base64!!!')).toBeNull();
  });

  it('returns null when the colon separator is missing', () => {
    const encoded = Buffer.from('client-1').toString('base64');
    expect(basicAuthCredentials(`Basic ${encoded}`)).toBeNull();
  });
});

describe('oauthErrorRedirect', () => {
  it('redirects with error, description, and state', () => {
    const res = oauthErrorRedirect(
      'https://client.example/callback',
      'access_denied',
      'state-123',
      'User denied consent'
    );
    expect(res).toBeInstanceOf(NextResponse);
    const location = res.headers.get('location');
    expect(location).toContain('error=access_denied');
    expect(location).toContain('error_description=User+denied+consent');
    expect(location).toContain('state=state-123');
    expect(res.status).toBe(302);
  });

  it('omits state when null', () => {
    const res = oauthErrorRedirect('https://client.example/callback', 'invalid_request', null);
    const location = res.headers.get('location');
    expect(location).not.toContain('state=');
  });
});

describe('noStore', () => {
  it('returns a no-store cache header', () => {
    expect(noStore()).toEqual({ 'Cache-Control': 'no-store' });
  });
});
