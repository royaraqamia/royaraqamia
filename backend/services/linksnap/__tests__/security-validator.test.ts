import { describe, it, expect } from 'vitest';
import { SecurityValidator } from '@/backend/services/linksnap/security-validator';

describe('SecurityValidator.isValidUrl', () => {
  it('accepts http and https URLs', () => {
    expect(SecurityValidator.isValidUrl('https://example.com')).toBe(true);
    expect(SecurityValidator.isValidUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('rejects non-http protocols', () => {
    expect(SecurityValidator.isValidUrl('ftp://example.com')).toBe(false);
    expect(SecurityValidator.isValidUrl('file:///etc/passwd')).toBe(false);
    expect(SecurityValidator.isValidUrl('javascript:alert(1)')).toBe(false);
    expect(SecurityValidator.isValidUrl('data:text/html,hi')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(SecurityValidator.isValidUrl('')).toBe(false);
    expect(SecurityValidator.isValidUrl('not a url')).toBe(false);
    expect(SecurityValidator.isValidUrl('example.com')).toBe(false);
    expect(SecurityValidator.isValidUrl('https://')).toBe(false);
  });
});

describe('SecurityValidator.isMaliciousOrLoopback', () => {
  it('flags known malicious keywords in the host', () => {
    expect(SecurityValidator.isMaliciousOrLoopback('https://phishing.example.com')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('https://malware.example.com')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('https://free-money-scam.example.com')).toBe(
      true
    );
    expect(SecurityValidator.isMaliciousOrLoopback('https://get-rich-quick.example.com')).toBe(
      true
    );
    expect(SecurityValidator.isMaliciousOrLoopback('https://hack-accounts.example.com')).toBe(true);
  });

  it('does not flag a public link whose path or query mentions a blocked word', () => {
    expect(
      SecurityValidator.isMaliciousOrLoopback('https://example.com/blog/how-linksnap-works')
    ).toBe(false);
    expect(
      SecurityValidator.isMaliciousOrLoopback('https://example.com/guide/localhost-setup')
    ).toBe(false);
    expect(SecurityValidator.isMaliciousOrLoopback('https://example.com/?q=10.0.0.1')).toBe(false);
    expect(
      SecurityValidator.isMaliciousOrLoopback('https://example.com/phishing-awareness-training')
    ).toBe(false);
    expect(SecurityValidator.isMaliciousOrLoopback('https://example.com/malware')).toBe(false);
    expect(SecurityValidator.isMaliciousOrLoopback('https://example.com/?next=127.0.0.1')).toBe(
      false
    );
  });

  it('flags loopback / private / internal addresses', () => {
    expect(SecurityValidator.isMaliciousOrLoopback('http://localhost')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://localhost:3000/x')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://api.localhost')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://127.0.0.1')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://127.0.0.1:8080/path')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://192.168.1.1')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://10.0.0.5')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://172.16.0.1')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://172.31.255.255')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://0.0.0.0')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://169.254.169.254')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://[::1]/')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://[fe80::1]/')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://[::ffff:127.0.0.1]/')).toBe(true);
  });

  it('accepts public IP literals and normal hostnames', () => {
    expect(SecurityValidator.isMaliciousOrLoopback('https://93.184.216.34/')).toBe(false);
    expect(SecurityValidator.isMaliciousOrLoopback('https://[2606:2800:220:1::1]/')).toBe(false);
    expect(SecurityValidator.isMaliciousOrLoopback('https://example.com/hello')).toBe(false);
    expect(SecurityValidator.isMaliciousOrLoopback('https://www.google.com')).toBe(false);
  });

  it('flags linksnap self-references to prevent redirect loops', () => {
    expect(SecurityValidator.isMaliciousOrLoopback('https://linksnap.app/abc123')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('http://www.linksnap.com')).toBe(true);
  });

  it("flags the site's own host, where short links resolve", () => {
    expect(SecurityValidator.isMaliciousOrLoopback('https://royaraqamia.com/abc123')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('https://www.royaraqamia.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(SecurityValidator.isMaliciousOrLoopback('HTTPS://LOCALHOST')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('https://Phishing.example.com')).toBe(true);
    expect(SecurityValidator.isMaliciousOrLoopback('https://PHISHING.example.com/path')).toBe(true);
  });

  it('fails closed when the host cannot be parsed', () => {
    expect(SecurityValidator.isMaliciousOrLoopback('not a url')).toBe(true);
  });
});

describe('SecurityValidator.validateUrl', () => {
  it('returns the trimmed URL on success', () => {
    expect(SecurityValidator.validateUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('accepts public links whose path or query mentions a blocked word', () => {
    expect(SecurityValidator.validateUrl('https://example.com/blog/how-linksnap-works')).toBe(
      'https://example.com/blog/how-linksnap-works'
    );
    expect(SecurityValidator.validateUrl('https://example.com/guide/localhost-setup')).toBe(
      'https://example.com/guide/localhost-setup'
    );
    expect(SecurityValidator.validateUrl('https://example.com/?q=10.0.0.1')).toBe(
      'https://example.com/?q=10.0.0.1'
    );
    expect(SecurityValidator.validateUrl('https://example.com/phishing-awareness-training')).toBe(
      'https://example.com/phishing-awareness-training'
    );
  });

  it('throws for empty input', () => {
    expect(() => SecurityValidator.validateUrl('')).toThrow('URL cannot be empty.');
    expect(() => SecurityValidator.validateUrl('   ')).toThrow('URL cannot be empty.');
  });

  it('throws for invalid formats', () => {
    expect(() => SecurityValidator.validateUrl('example.com')).toThrow(
      'Invalid URL format. Please include http:// or https://'
    );
    expect(() => SecurityValidator.validateUrl('ftp://example.com')).toThrow(
      'Invalid URL format. Please include http:// or https://'
    );
  });

  it('throws the security block error for malicious or loopback URLs', () => {
    expect(() => SecurityValidator.validateUrl('http://localhost:3000')).toThrow('Security Block');
    expect(() => SecurityValidator.validateUrl('https://phishing.example.com')).toThrow(
      'Security Block'
    );
    expect(() => SecurityValidator.validateUrl('http://[::1]/')).toThrow('Security Block');
    expect(() => SecurityValidator.validateUrl('https://linksnap.app/abc123')).toThrow(
      'Security Block'
    );
  });
});
