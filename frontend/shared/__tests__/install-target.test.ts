import { describe, it, expect } from 'vitest';

import { installChannelFor } from '../install-target';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('installChannelFor', () => {
  it('sends Android to the APK, whatever browser it runs', () => {
    expect(
      installChannelFor(
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115 Mobile Safari/537.36',
        5
      )
    ).toBe('android-apk');
  });

  it('sends Chromium on a desktop to the browser prompt', () => {
    expect(installChannelFor(CHROME_WINDOWS, 0)).toBe('browser-prompt');
    expect(installChannelFor(CHROME_WINDOWS.replace('Chrome/120.0.0.0', 'Edg/120.0.0.0'), 0)).toBe(
      'browser-prompt'
    );
  });

  it('gives Safari the steps, because it installs without a prompt', () => {
    expect(installChannelFor(SAFARI_MAC, 0)).toBe('macos-steps');
    expect(installChannelFor(SAFARI_IPHONE, 5)).toBe('ios-steps');
  });

  it('reads an iPad as iOS through its touch points, not as a Mac', () => {
    expect(installChannelFor(SAFARI_MAC, 5)).toBe('ios-steps');
  });

  it('offers nothing to the browsers with no install path', () => {
    expect(
      installChannelFor(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        0
      )
    ).toBe('none');
    // Every browser on iOS but Safari says "Safari" in its agent and installs nothing.
    expect(
      installChannelFor(SAFARI_IPHONE.replace('Version/17.0', 'CriOS/120.0.6099.119'), 5)
    ).toBe('none');
  });
});
