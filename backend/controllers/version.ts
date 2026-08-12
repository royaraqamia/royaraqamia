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
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
