import { describe, it, expect } from 'vitest';
import { parseUserAgent } from '@/backend/services/linksnap/user-agent-parser';

describe('parseUserAgent', () => {
  it('handles null/empty/undefined input', () => {
    for (const ua of [null, undefined, '']) {
      expect(parseUserAgent(ua)).toEqual({
        deviceType: 'other',
        os: { name: 'Unknown', version: null },
        browser: { name: 'Unknown', version: null },
      });
    }
  });

  it('parses desktop Chrome on Windows', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );
    expect(info.deviceType).toBe('desktop');
    expect(info.os).toEqual({ name: 'Windows', version: '10' });
    expect(info.browser).toEqual({ name: 'Chrome', version: '126.0.0.0' });
  });

  it('parses desktop Firefox on macOS', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/127.0'
    );
    expect(info.deviceType).toBe('desktop');
    expect(info.os).toEqual({ name: 'macOS', version: '10.15.7' });
    expect(info.browser).toEqual({ name: 'Firefox', version: '127.0' });
  });

  it('parses mobile Safari on iPhone', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    );
    expect(info.deviceType).toBe('mobile');
    expect(info.os).toEqual({ name: 'iOS', version: '17.5' });
    expect(info.browser).toEqual({ name: 'Safari', version: '17.5' });
  });

  it('parses mobile Chrome on Android', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36'
    );
    expect(info.deviceType).toBe('mobile');
    expect(info.os).toEqual({ name: 'Android', version: '14' });
    expect(info.browser).toEqual({ name: 'Chrome', version: '125.0.6422.113' });
  });

  it('classifies Android tablets without Mobile token', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    );
    expect(info.deviceType).toBe('tablet');
    expect(info.os).toEqual({ name: 'Android', version: '13' });
  });

  it('parses Edge and Samsung Internet ahead of Chrome', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Edg/126.0.0.0'
      ).browser.name
    ).toBe('Edge');

    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'
      ).browser.name
    ).toBe('Samsung Internet');
  });

  it('parses ChromeOS and Linux', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0'
      ).os
    ).toEqual({ name: 'ChromeOS', version: null });

    expect(
      parseUserAgent(
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'
      ).os
    ).toEqual({ name: 'Linux', version: null });
  });
});
