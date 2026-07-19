'use server';

import * as Sentry from '@sentry/nextjs';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import type { Tables } from '@/lib/supabase/database.types';

// ============================================================
// Validation Schema
// ============================================================

const certificateSchema = z.object({
  student_name: z.string().min(2, 'اسم الطالب قصير جداً').max(200, 'اسم الطالب طويل جداً'),
  course_name: z.string().min(2, 'اسم الدورة قصير جداً').max(200, 'اسم الدورة طويل جداً'),
  issue_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'تاريخ الإصدار غير صالح'),
  expiration_date: z
    .string()
    .optional()
    .refine((d) => !d || !isNaN(Date.parse(d)), 'تاريخ الانتهاء غير صالح'),
  grade_or_status: z.string().max(100).optional(),
});

export type AdminCertificate = Tables<'certificates'>;

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
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

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
    const idx = Math.floor(Math.random() * charsArr.length);
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
  await requireAuth();
  const admin = getAdminSupabase();

  let query = admin
    .from('certificates')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(
      `student_name.ilike.%${search}%,course_name.ilike.%${search}%,certificate_code.ilike.%${search}%`
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    Sentry.captureException(error);
    return { data: [], total: 0 };
  }

  return { data: (data as AdminCertificate[]) ?? [], total: count ?? 0 };
}

export async function getCertificateById(id: string): Promise<AdminCertificate | null> {
  await requireAuth();
  const admin = getAdminSupabase();

  const { data, error } = await admin.from('certificates').select('*').eq('id', id).single();

  if (error || !data) return null;
  return data as AdminCertificate;
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

  const admin = getAdminSupabase();
  const code = customCode?.trim().toUpperCase() || generateCode();

  // Validate custom code format
  if (customCode && !/^COMP-\d{4}-[A-Z0-9]{8}$/.test(code)) {
    return {
      success: false,
      error: 'صيغة الرمز غير صالحة. الصيغة: COMP-YYYY-XXXXXXXX',
    };
  }

  const { data, error } = await admin
    .from('certificates')
    .insert({
      certificate_code: code,
      student_name: parsed.data.student_name,
      course_name: parsed.data.course_name,
      issue_date: parsed.data.issue_date,
      expiration_date: parsed.data.expiration_date || null,
      grade_or_status: parsed.data.grade_or_status || null,
    })
    .select()
    .single();

  if (error) {
    Sentry.captureException(error);
    if (error.code === '23505') {
      return { success: false, error: 'هذا الرمز مستخدم بالفعل. جرب رمزاً آخر.' };
    }
    return { success: false, error: 'حدث خطأ أثناء إنشاء الشهادة' };
  }

  return { success: true, data: data as AdminCertificate };
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

  const admin = getAdminSupabase();

  const { data, error } = await admin
    .from('certificates')
    .update({
      student_name: parsed.data.student_name,
      course_name: parsed.data.course_name,
      issue_date: parsed.data.issue_date,
      expiration_date: parsed.data.expiration_date || null,
      grade_or_status: parsed.data.grade_or_status || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: 'حدث خطأ أثناء تحديث الشهادة' };
  }

  return { success: true, data: data as AdminCertificate };
}

export async function deleteCertificate(id: string): Promise<AdminActionResult> {
  await requireAuth();
  const admin = getAdminSupabase();

  const { error } = await admin.from('certificates').delete().eq('id', id);

  if (error) {
    Sentry.captureException(error);
    return { success: false, error: 'حدث خطأ أثناء حذف الشهادة' };
  }

  return { success: true };
}
