import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { createCertificate, listCertificates } from '@/backend/controllers/certificates';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = Number(searchParams.get('pageSize') ?? '20') || 20;
  const search = searchParams.get('search') ?? '';
  return toNextResponse(await listCertificates(page, pageSize, search));
}

export async function POST(req: Request) {
  const body = await req.json();
  return toNextResponse(await createCertificate(body));
}
