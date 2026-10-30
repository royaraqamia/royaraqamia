import { NextResponse, type NextRequest } from 'next/server';

import { minimumSupportedAppVersionCode } from '@/backend/config/app-update';
import {
  APP_UPDATE_REQUIRED_CODE,
  APP_UPDATE_REQUIRED_STATUS,
  shellVersionFromUserAgent,
} from '@/shared/app-update';
import { AppUpdateRequiredSchema } from '@/shared/contracts/app-update';

/**
 * Owned API prefixes answer a below-floor app with the typed `426` (#503).
 *
 * The app's screens are compiled into the APK, so a change reaches an installed
 * device only through the update channel. The floor is what retires a build the
 * server can no longer serve: instead of a crash, a blank screen or an answer the
 * old client misreads, the request is refused in a shape the app already knows how
 * to route to its update card.
 *
 * Only the shell's own user agent is gated. A browser sends no counter, so the web
 * is never refused; `/api/version` stays open because it is the deploy's identity
 * rather than owned data, and `/api/app-perf` stays open so even a below-floor
 * build can report why it is failing.
 */
export const OWNED_API_PREFIX = '/api/';
export const APP_UPDATE_BYPASS_PATHS = ['/api/version', '/api/app-perf'] as const;

export interface AppUpdateGateOptions {
  minimumVersionCode?: number;
}

export function isOwnedApiPath(pathname: string): boolean {
  if (!pathname.startsWith(OWNED_API_PREFIX)) return false;
  return !APP_UPDATE_BYPASS_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/** The decision, without Next's request object so it is cheap to test. */
export function appUpdateRequired({
  userAgent,
  pathname,
  minimumVersionCode,
}: {
  userAgent: string | null | undefined;
  pathname: string;
  minimumVersionCode: number;
}): boolean {
  if (!isOwnedApiPath(pathname)) return false;
  if (!Number.isInteger(minimumVersionCode) || minimumVersionCode <= 0) return false;

  const installed = shellVersionFromUserAgent(userAgent ?? '');
  return installed !== null && installed < minimumVersionCode;
}

/** The response the middleware returns, or null when the request may continue. */
export function withAppUpdateGate(
  request: NextRequest,
  { minimumVersionCode = minimumSupportedAppVersionCode }: AppUpdateGateOptions = {}
): NextResponse | null {
  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;
  const required = appUpdateRequired({
    userAgent: request.headers.get('user-agent'),
    pathname,
    minimumVersionCode,
  });
  if (!required) return null;

  return NextResponse.json(
    AppUpdateRequiredSchema.parse({
      success: false,
      error: 'يلزم تحديث التَّطبيق للمتابعة.',
      code: APP_UPDATE_REQUIRED_CODE,
      minimumVersionCode,
    }),
    {
      status: APP_UPDATE_REQUIRED_STATUS,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
