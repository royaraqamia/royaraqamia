import { NextRequest } from 'next/server';
import { AVATAR_MAX_BYTES } from '@/shared/contracts/users';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { MultipartTooLargeError, readMultipartWithin } from '@/backend/transport/multipart';
import { removeAvatar, uploadAvatar } from '@/backend/controllers/profile';

export async function POST(req: NextRequest) {
  try {
    const formData = await readMultipartWithin(req, AVATAR_MAX_BYTES);
    return toNextResponse(await uploadAvatar(formData, req.headers));
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
  return toNextResponse(await removeAvatar(req.headers));
}
