import { env } from '@/backend/config/env';
import { appVersion } from '@/backend/config/generated/app-version';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

export function getAppVersion(): HttpResult {
  return jsonResult(
    200,
    {
      version: env.version,
      releaseVersion: appVersion.releaseVersion,
      commit: appVersion.commit,
      ref: appVersion.ref,
      env: appVersion.env,
      releasedAt: appVersion.releasedAt,
    },
    // Frozen at build time and polled every minute by every open tab; edge
    // caching collapses those polls into CDN hits without delaying update
    // detection beyond the client's existing 60s poll interval.
    {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    }
  );
}
