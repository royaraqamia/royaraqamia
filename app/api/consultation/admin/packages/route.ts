import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { adminCreatePackage, adminListPackages } from '@/backend/controllers/consultation';

export async function GET() {
  return toNextResponse(await adminListPackages());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = await adminCreatePackage(body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
