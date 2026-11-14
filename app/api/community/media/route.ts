import { NextRequest, NextResponse } from 'next/server';
import { uploadMedia } from '@/backend/controllers/blogpress';
import { POST_IMAGE_MAX_BYTES } from '@/backend/services/blogpress/media-service';
import { toNextResponse } from '@/backend/transport/http-result';
import { MultipartTooLargeError, readMultipartWithin } from '@/backend/transport/multipart';

export async function POST(req: NextRequest) {
  try {
    const formData = await readMultipartWithin(req, POST_IMAGE_MAX_BYTES);
    return toNextResponse(await uploadMedia(formData));
  } catch (error) {
    if (error instanceof MultipartTooLargeError) {
      return NextResponse.json(
        { success: false, error: 'يجب أن يكون الملف أقل من 5 ميغابايت' },
        { status: 413 }
      );
    }
    throw error;
  }
}
