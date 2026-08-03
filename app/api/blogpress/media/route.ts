import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { uploadMedia } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const result = await uploadMedia(formData);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
