import { NextRequest } from 'next/server';
import { uploadMedia } from '@/backend/controllers/blogpress';
import { POST_IMAGE_MAX_BYTES } from '@/backend/services/blogpress/media-service';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { MultipartTooLargeError, readMultipartWithin } from '@/backend/transport/multipart';

export async function POST(req: NextRequest) {
  try {
    const formData = await readMultipartWithin(req, POST_IMAGE_MAX_BYTES);
    return toNextResponse(await uploadMedia(formData));
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return toNextResponse(
        jsonResult(
          413,
          { success: false, error: 'يجب أن يكون الملف أقل من 5 ميغابايت' },
          { headers: NO_STORE }
        )
      );
    }
    throw error;
  }
}
