import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { uploadMedia } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => new FormData());
  const result = await uploadMedia(formData);
  return toNextResponse(result);
}
