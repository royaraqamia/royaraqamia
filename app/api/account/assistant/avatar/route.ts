import { NextRequest } from 'next/server';

import {
  removeAssistantAvatar,
  uploadAssistantAvatar,
} from '@/backend/controllers/assistant-identity';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { MultipartTooLargeError, readMultipartWithin } from '@/backend/transport/multipart';
import { AVATAR_MAX_BYTES } from '@/shared/contracts/users';

/**
 * `POST|DELETE /api/account/assistant/avatar`: the member's face for their own
 * assistant (ADR-0228).
 *
 * The same multipart guard, size ceiling and bucket as `/api/me/avatar`; the
 * difference is which row the public URL is written to. Both answer `no-store`,
 * because the answer carries the member's whole identity back.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await readMultipartWithin(req, AVATAR_MAX_BYTES);
    return toNextResponse(await uploadAssistantAvatar(formData, req.headers));
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return toNextResponse(
        jsonResult(
          413,
          { success: false, error: 'يجب أن تكون الصورة أقل من 5 ميغابايت' },
          { headers: NO_STORE }
        )
      );
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest) {
  return toNextResponse(await removeAssistantAvatar(req.headers));
}
