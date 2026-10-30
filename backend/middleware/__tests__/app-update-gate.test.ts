import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { appUpdateRequired, withAppUpdateGate } from '@/backend/middleware/app-update';
import { APP_UPDATE_REQUIRED_STATUS } from '@/shared/app-update';
import { AppUpdateRequiredSchema } from '@/shared/contracts/app-update';

const SHELL = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 RoyaraqamiaShell/1.0.21+20021';
const OLDER = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 RoyaraqamiaShell/1.0.0+20000';
const BROWSER = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0';

const request = (pathname: string, userAgent: string) =>
  new NextRequest(`https://royaraqamia.com${pathname}`, {
    headers: { 'user-agent': userAgent },
  });

describe('the app-update gate', () => {
  it('refuses an owned API to a shell below the floor', () => {
    expect(
      appUpdateRequired({
        userAgent: OLDER,
        pathname: '/api/me',
        minimumVersionCode: 20021,
      })
    ).toBe(true);
  });

  it('does not refuse a shell at or above the floor', () => {
    for (const userAgent of [SHELL, BROWSER]) {
      expect(
        appUpdateRequired({
          userAgent,
          pathname: '/api/me',
          minimumVersionCode: 20021,
        })
      ).toBe(false);
    }
  });

  it('never gates a browser, because a browser sends no counter', () => {
    expect(
      appUpdateRequired({ userAgent: BROWSER, pathname: '/api/me', minimumVersionCode: 30000 })
    ).toBe(false);
  });

  it('leaves the deploy identity and diagnostics open', () => {
    for (const pathname of ['/api/version', '/api/app-perf', '/android/latest.json']) {
      expect(appUpdateRequired({ userAgent: OLDER, pathname, minimumVersionCode: 30000 })).toBe(
        false
      );
    }
  });

  it('answers the typed 426 the app routes to its dialog', async () => {
    const response = withAppUpdateGate(request('/api/me', OLDER), { minimumVersionCode: 20021 });

    expect(response?.status).toBe(APP_UPDATE_REQUIRED_STATUS);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    if (!response) throw new Error('expected a 426 response');
    const body = AppUpdateRequiredSchema.parse(await response.json());
    expect(body).toEqual({
      success: false,
      error: 'يلزم تحديث التَّطبيق للمتابعة.',
      code: 'app_update_required',
      minimumVersionCode: 20021,
    });
  });

  it('lets an up-to-date shell through to the route', () => {
    expect(withAppUpdateGate(request('/api/me', SHELL), { minimumVersionCode: 20021 })).toBeNull();
  });
});
