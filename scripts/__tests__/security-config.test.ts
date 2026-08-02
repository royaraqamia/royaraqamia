import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('security configuration', () => {
  it('next.config.js ships the required security headers', () => {
    const config = read('next.config.js');
    const required = [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'X-Permitted-Cross-Domain-Policies',
      'Permissions-Policy',
    ];
    for (const header of required) {
      expect(config, `missing header ${header}`).toContain(header);
    }
  });

  it('CSP is restrictive (default-src self, no wildcard frame-ancestors)', () => {
    const config = read('next.config.js');
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("frame-ancestors 'self'");
    expect(config).toContain('upgrade-insecure-requests');
  });

  it('does not allow CORS wildcard with credentials', () => {
    const config = read('next.config.js');
    expect(config).not.toContain('Access-Control-Allow-Origin');
  });

  it('publishes a machine-readable security.txt (RFC 9116)', () => {
    const securityTxt = read('public/.well-known/security.txt');
    expect(securityTxt).toMatch(/^Contact: mailto:/m);
    expect(securityTxt).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(securityTxt).toMatch(/^Canonical: https:/m);
    expect(securityTxt).toMatch(/^Policy: https:/m);
  });

  it('exposes a public PGP key file for encrypted reports', () => {
    expect(() => read('public/.well-known/security.txt.pgp')).not.toThrow();
  });

  it('gitignores env files and secret-bearing extensions', () => {
    const gitignore = read('.gitignore');
    expect(gitignore).toContain('.env*');
    expect(gitignore).toContain('*.pem');
  });

  it('example.env contains placeholder values only (no real secrets)', () => {
    const env = read('example.env');
    const secretShapedValues = [
      /sk_live_/i,
      /(sg_|re_|key-|xoxb-|ghp_|github_pat_)/i,
      /eyJ[a-zA-Z0-9_-]{10,}/, // JWT
      /sb_secret_/i,
      /\bservice_role\s*[:=]/i,
    ];
    for (const pattern of secretShapedValues) {
      expect(env, `example.env appears to contain a real secret matching ${pattern}`).not.toMatch(
        pattern
      );
    }
    expect(env).toContain('SUPABASE_SERVICE_ROLE_KEY=');
  });

  it('typescript.ignoreBuildErrors is only tolerated with a documented compensating control', () => {
    const config = read('next.config.js');
    const policy = read('SECURITY.md');
    if (config.includes('ignoreBuildErrors: true')) {
      expect(policy).toContain('Known limitation: TypeScript 7 native preview');
      expect(policy).toMatch(/`tsc --noEmit`/);
    }
  });
});
