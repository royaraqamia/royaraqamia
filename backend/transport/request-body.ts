import type { z } from 'zod';

import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/** Result of a boundary parse: the typed payload, or the `400` to answer with. */
export type ParsedBody<T> = { ok: true; data: T } | { ok: false; result: HttpResult };

/**
 * Validates a raw request body against its contract schema at the transport
 * boundary (SECURITY.md), so a malformed body is answered `400` with
 * `zodFieldErrors` and never reaches a service or repository. The parsed value
 * is typed from the schema, so callers hand the controller the contract shape
 * instead of re-casting `unknown` fields.
 */
export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown
): ParsedBody<z.infer<Schema>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      result: jsonResult(400, {
        success: false,
        error: 'تحقق من الحقول المدخلة.',
        fieldErrors: zodFieldErrors(parsed.error),
      }),
    };
  }
  return { ok: true, data: parsed.data };
}
