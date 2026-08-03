import { env } from '@/backend/config/env';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

export function getAppVersion(): HttpResult {
  return jsonResult(
    200,
    { version: env.version },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
