import type { z } from 'zod';

/**
 * Flattens a Zod error into the `{ field: message }` envelope the Admin forms
 * read. The first issue per field wins, and a root-level issue (one with no
 * path) lands under `form` so it is not silently dropped.
 *
 * Array indices are dropped so an issue on an array element keys onto the array
 * field itself (`recipient_user_ids`, not `recipient_user_ids.0`), which is the
 * name the form looks the error up by.
 *
 * Shared by every controller that returns validation failures, so the same
 * invalid input is reported the same way whichever product received it.
 */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.filter((segment) => typeof segment !== 'number').join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
