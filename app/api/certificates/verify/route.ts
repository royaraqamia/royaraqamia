import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { verifyCertificateByCode } from '@/backend/config/certificates';
import { getForwardedIp } from '@/backend/transport/http';
import type { VerifyResult } from '@/shared/contracts/certificates';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const headerStore = await headers();
    const ip = getForwardedIp(headerStore);

    return NextResponse.json(await verifyCertificateByCode(body.code ?? '', ip));
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    } satisfies VerifyResult);
  }
}
