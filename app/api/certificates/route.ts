import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { createCertificatesService } from '@/backend/config/certificates';
import {
  CertificateCodeFormatError,
  CertificateDuplicateCodeError,
  CertificateValidationError,
} from '@/backend/services/certificates/certificates-service';
import type { Certificate } from '@/shared/contracts/certificates';

type AdminCertificate = Certificate;

interface AdminActionResult {
  success: boolean;
  data?: AdminCertificate;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = Number(searchParams.get('pageSize') ?? '20') || 20;
  const search = searchParams.get('search') ?? '';

  try {
    await requireAdminAuth();
    return NextResponse.json(
      await createCertificatesService(getAdminSupabase()).list(page, pageSize, search)
    );
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ data: [], total: 0 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminAuth();

    const body = await req.json();
    const data = await createCertificatesService(getAdminSupabase()).create(
      body.formData,
      body.customCode
    );

    return NextResponse.json({ success: true, data } satisfies AdminActionResult);
  } catch (error) {
    Sentry.captureException(error);
    if (error instanceof CertificateValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          fieldErrors: error.fieldErrors,
        } satisfies AdminActionResult,
        { status: 400 }
      );
    }
    if (error instanceof CertificateCodeFormatError) {
      return NextResponse.json(
        { success: false, error: error.message } satisfies AdminActionResult,
        {
          status: 400,
        }
      );
    }
    if (error instanceof CertificateDuplicateCodeError) {
      return NextResponse.json(
        { success: false, error: error.message } satisfies AdminActionResult,
        {
          status: 409,
        }
      );
    }
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء إنشاء الشهادة' } satisfies AdminActionResult,
      { status: 500 }
    );
  }
}
