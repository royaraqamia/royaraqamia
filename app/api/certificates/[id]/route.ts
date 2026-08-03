import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import {
  deleteCertificate,
  getCertificateById,
  updateCertificate,
} from '@/backend/controllers/certificates';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await getCertificateById(id));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  return toNextResponse(await updateCertificate(id, body));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await deleteCertificate(id));
}
