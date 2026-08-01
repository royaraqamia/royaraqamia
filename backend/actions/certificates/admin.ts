'use server';

import * as Sentry from '@sentry/nextjs';
import { randomInt } from 'crypto';
import { getAdminSupabase } from '@/backend/transport/supabase/admin';
import { createClient } from '@/backend/transport/supabase/server';
import { createCertificatesRepository } from '@/backend/repositories/certificates';
import { z } from 'zod';
import type { Certificate } from '@/shared/contracts/certificates';
import { getAdminEmails } from '@/shared/admin-validator';

// ============================================================
// Validation Schema
// ============================================================

const certificateSchema = z
  .object({
    student_name: z.string().min(2, 'اسم الطالب قصير جداً').max(200, 'اسم الطالب طويل جداً'),
    course_name: z.string().min(2, 'اسم الدورة قصير جداً').max(200, 'اسم الدورة طويل جداً'),
    issue_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'تاريخ الإصدار غير صالح'),
    expiration_date: z
      .string()
      .optional()
      .refine((d) => !d || !isNaN(Date.parse(d)), 'تاريخ الانتهاء غير صالح'),
    grade_or_status: z.string().max(100).optional(),
  })
  .refine(
    (data) => {
      if (!data.expiration_date) return true;
      return new Date(data.expiration_date) > new Date(data.issue_date);
    },
    { message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار', path: ['expiration_date'] }
  );

export type AdminCertificate = Certificate;

export interface AdminActionResult {
  success: boolean;
  data?: AdminCertificate;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// ============================================================
// Auth Guard
// ============================================================

export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('UNAUTHORIZED');
  }

  // RBAC: check if user email is in the admin list
  const adminEmails = getAdminEmails();

  if (adminEmails.length > 0 && !adminEmails.includes(user.email?.toLowerCase() ?? '')) {
    throw new Error('FORBIDDEN');
  }

  return { supabase, user };
}

// ============================================================
// Generate unique certificate code
// ============================================================

function generateCode(): string {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const charsArr = chars.split('');
  let random = '';
  for (let i = 0; i < 8; i++) {
    const idx = randomInt(charsArr.length);
    random += charsArr[idx] ?? '';
  }
  return `COMP-${year}-${random}`;
}

// ============================================================
// CRUD Operations
// ============================================================

export async function getCertificates(
  page = 1,
  pageSize = 20,
  search = ''
): Promise<{ data: AdminCertificate[]; total: number }> {
  try {
    await requireAuth();
    return await createCertificatesRepository(getAdminSupabase()).list(page, pageSize, search);
  } catch (error) {
    Sentry.captureException(error);
    return { data: [], total: 0 };
  }
}

export async function getCertificateById(id: string): Promise<AdminCertificate | null> {
  try {
    await requireAuth();
    return await createCertificatesRepository(getAdminSupabase()).getById(id);
  } catch {
    return null;
  }
}

export async function createCertificate(
  formData: {
    student_name: string;
    course_name: string;
    issue_date: string;
    expiration_date?: string;
    grade_or_status?: string;
  },
  customCode?: string
): Promise<AdminActionResult> {
  try {
    await requireAuth();

    const parsed = certificateSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      return { success: false, error: 'بيانات غير صالحة', fieldErrors };
    }

    const code = customCode?.trim().toUpperCase() || generateCode();

    // Validate custom code format
    if (customCode && !/^COMP-\d{4}-[A-Z0-9]{8}$/.test(code)) {
      return {
        success: false,
        error: 'صيغة الرمز غير صالحة. الصيغة: COMP-YYYY-XXXXXXXX',
      };
    }

    const data = await createCertificatesRepository(getAdminSupabase()).create({
      certificate_code: code,
      student_name: parsed.data.student_name,
      course_name: parsed.data.course_name,
      issue_date: parsed.data.issue_date,
      expiration_date: parsed.data.expiration_date || null,
      grade_or_status: parsed.data.grade_or_status || null,
    });

    return { success: true, data };
  } catch (error) {
    Sentry.captureException(error);
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return { success: false, error: 'هذا الرمز مستخدم بالفعل. جرب رمزاً آخر.' };
    }
    return { success: false, error: 'حدث خطأ أثناء إنشاء الشهادة' };
  }
}

export async function updateCertificate(
  id: string,
  formData: {
    student_name: string;
    course_name: string;
    issue_date: string;
    expiration_date?: string;
    grade_or_status?: string;
  }
): Promise<AdminActionResult> {
  try {
    await requireAuth();

    const parsed = certificateSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      return { success: false, error: 'بيانات غير صالحة', fieldErrors };
    }

    const data = await createCertificatesRepository(getAdminSupabase()).update(id, {
      student_name: parsed.data.student_name,
      course_name: parsed.data.course_name,
      issue_date: parsed.data.issue_date,
      expiration_date: parsed.data.expiration_date || null,
      grade_or_status: parsed.data.grade_or_status || null,
    });

    return { success: true, data };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: 'حدث خطأ أثناء تحديث الشهادة' };
  }
}

export async function deleteCertificate(id: string): Promise<AdminActionResult> {
  try {
    await requireAuth();
    await createCertificatesRepository(getAdminSupabase()).delete(id);
    return { success: true };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: 'حدث خطأ أثناء حذف الشهادة' };
  }
}
