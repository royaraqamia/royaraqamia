import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { adminDeletePackage, adminUpdatePackage } from '@/backend/controllers/consultation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await adminUpdatePackage(id, body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await adminDeletePackage(id);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
