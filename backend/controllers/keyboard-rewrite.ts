import {
  createKeyboardPlanGate,
  createKeyboardRewriteService,
  keyboardUnavailable,
} from '@/backend/config/keyboard';
import { KEYBOARD_REWRITE_COPY } from '@/backend/copy/keyboard-rewrite';
import { AppError } from '@/backend/shared/errors';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { withKeyboardCredential } from '@/backend/transport/keyboard-token-handler';
import {
  KEYBOARD_REWRITE_SCOPE,
  KeyboardConsentSchema,
  KeyboardRewriteRequestSchema,
} from '@/shared/contracts/keyboard-rewrite';
import { USAGE_COUNTERS } from '@/shared/contracts/plans.constants';
import {
  KEYBOARD_CREDENTIAL_TTL_SECONDS,
  mintKeyboardCredential,
} from '@/backend/services/keyboard/rewrite-credential';

/**
 * The two doors of the keyboard's AI feature (ADR-0220).
 *
 * Consent is granted on the web with the signed-in session and mints a scoped,
 * short-lived credential. The rewrite itself never reads that session: it takes
 * the credential in an Authorization header and the composing text in the body,
 * spends the member's daily allowance through the plan gate, and releases the
 * spend if the single provider call fails or times out.
 */
const CROSS_ORIGIN_REFUSAL = 'طلب من أصل غير معروف.';

/** Mint the credential after an explicit consent tap on the signed-in site. */
export async function grantKeyboardRewrite(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
      }
      const parsed = KeyboardConsentSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: KEYBOARD_REWRITE_COPY.needsConsent });
      }

      const credential = mintKeyboardCredential(userId);
      if (!credential) {
        return jsonResult(503, { success: false, error: KEYBOARD_REWRITE_COPY.failure });
      }
      return jsonResult(200, {
        success: true,
        token: credential.token,
        expiresIn: KEYBOARD_CREDENTIAL_TTL_SECONDS,
        scope: KEYBOARD_REWRITE_SCOPE,
      });
    },
    { mapError: () => jsonResult(500, { success: false, error: KEYBOARD_REWRITE_COPY.failure }) }
  );
}

/** One bounded rewrite. The composing text is the only content in the request. */
export async function rewriteKeyboardText(
  body: Record<string, unknown>,
  authorization: string | null
): Promise<HttpResult> {
  const parsed = KeyboardRewriteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: parsed.error.issues[0]?.message ?? KEYBOARD_REWRITE_COPY.failure,
    });
  }

  return withKeyboardCredential(
    authorization,
    async ({ userId }) => {
      const service = createKeyboardRewriteService();
      if (!service) {
        return jsonResult(503, { success: false, error: keyboardUnavailable() });
      }

      // `count` reserves before the call and releases on any throw, which is
      // what makes a refused, failed or timed-out rewrite spend nothing.
      const suggestion = await createKeyboardPlanGate().count(
        { userId },
        USAGE_COUNTERS.keyboardRewrites,
        () => service.rewrite(parsed.data.text)
      );
      return jsonResult(200, { success: true, suggestion });
    },
    {
      mapError: (error) => {
        if (error instanceof AppError && error.statusCode === 402) {
          return jsonResult(402, { success: false, error: error.message });
        }
        return jsonResult(502, { success: false, error: KEYBOARD_REWRITE_COPY.failure });
      },
      whenFailed: { success: false, error: KEYBOARD_REWRITE_COPY.failure },
    }
  );
}
