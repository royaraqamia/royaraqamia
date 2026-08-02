import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { createCertificatesService } from '@/backend/config/certificates';
import { CertificateValidationError } from '@/backend/services/certificates/certificates-service';
import type { Certificate } from '@/shared/contracts/certificates';

type AdminCertificate = Certificate;

interface AdminActionResult {
  success: boolean;
  data?: AdminCertificate;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await requireAdminAuth();
    const certificate = await createCertificatesService(getAdminSupabase()).getById(id);
    if (!certificate) {
      return NextResponse.json(null);
    }
    return NextResponse.json(certificate);
  } catch {
    return NextResponse.json(null);
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await requireAdminAuth();

    const body = await req.json();
    const data = await createCertificatesService(getAdminSupabase()).update(id, body);

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
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء تحديث الشهادة' } satisfies AdminActionResult,
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await requireAdminAuth();
    await createCertificatesService(getAdminSupabase()).delete(id);
    return NextResponse.json({ success: true } satisfies AdminActionResult);
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء حذف الشهادة' } satisfies AdminActionResult,
      { status: 500 }
    );
  }
}
