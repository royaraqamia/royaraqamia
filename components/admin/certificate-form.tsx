'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowRight, CalendarDays, User, GraduationCap, Trophy, Hash } from 'lucide-react';

interface CertificateFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    certificate_code: string;
    student_name: string;
    course_name: string;
    issue_date: string;
    expiration_date: string | null;
    grade_or_status: string | null;
  };
  onSubmit: (data: {
    student_name: string;
    course_name: string;
    issue_date: string;
    expiration_date?: string;
    grade_or_status?: string;
  }) => Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string> }>;
}

export function CertificateForm({ mode, initialData, onSubmit }: CertificateFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [form, setForm] = useState({
    student_name: initialData?.student_name ?? '',
    course_name: initialData?.course_name ?? '',
    issue_date: initialData?.issue_date ?? new Date().toISOString().split('T')[0] ?? '',
    expiration_date: initialData?.expiration_date ?? '',
    grade_or_status: initialData?.grade_or_status ?? '',
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setGlobalError('');

    try {
      const result = await onSubmit({
        student_name: form.student_name,
        course_name: form.course_name,
        issue_date: form.issue_date,
        expiration_date: form.expiration_date || undefined,
        grade_or_status: form.grade_or_status || undefined,
      });

      if (result.success) {
        toast.success(mode === 'create' ? 'تم إصدار الشهادة بنجاح' : 'تم حفظ التعديلات بنجاح');
        router.push('/admin/certificates');
        router.refresh();
      } else {
        setGlobalError(result.error || 'حدث خطأ');
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error || 'حدث خطأ');
      }
    } catch {
      setGlobalError('حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.');
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/certificates">
            <ArrowRight className="size-4" />
            العودة للقائمة
          </Link>
        </Button>
      </div>

      <div className="space-y-6">
        {/* Header Card */}
        <Card className="glass-card overflow-hidden border-primary/10">
          <CardHeader className="border-b border-primary/10 bg-gradient-to-l from-primary/5 to-transparent">
            <CardTitle className="flex items-center gap-3 text-lg">
              {mode === 'create' ? (
                <>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Hash className="text-primary size-4" />
                  </div>
                  إصدار شهادة جديدة
                </>
              ) : (
                <>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <PencilIcon />
                  </div>
                  تعديل الشهادة
                </>
              )}
            </CardTitle>
            {initialData?.certificate_code && (
              <p className="text-muted-foreground font-mono text-sm">
                {initialData.certificate_code}
              </p>
            )}
          </CardHeader>
        </Card>

        {/* Student Info */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="text-primary size-4" />
              معلومات الطالب
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              label="اسم الطالب *"
              value={form.student_name}
              onChange={(v) => updateField('student_name', v)}
              error={errors.student_name}
              placeholder="أحمد محمد"
              icon={<User className="size-4" />}
            />
          </CardContent>
        </Card>

        {/* Course Info */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="text-primary size-4" />
              معلومات الدورة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FormField
              label="اسم الدورة *"
              value={form.course_name}
              onChange={(v) => updateField('course_name', v)}
              error={errors.course_name}
              placeholder="تطوير الويب الاحترافي"
              icon={<GraduationCap className="size-4" />}
            />
            <FormField
              label="الدرجة / الحالة"
              value={form.grade_or_status}
              onChange={(v) => updateField('grade_or_status', v)}
              error={errors.grade_or_status}
              placeholder="ممتاز، جيد جداً، مكتمل..."
              icon={<Trophy className="size-4" />}
            />
          </CardContent>
        </Card>

        {/* Dates */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="text-primary size-4" />
              التواريخ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="تاريخ الإصدار *"
                type="date"
                value={form.issue_date}
                onChange={(v) => updateField('issue_date', v)}
                error={errors.issue_date}
                icon={<CalendarDays className="size-4" />}
              />
              <FormField
                label="تاريخ الانتهاء"
                type="date"
                value={form.expiration_date}
                onChange={(v) => updateField('expiration_date', v)}
                error={errors.expiration_date}
              />
            </div>
          </CardContent>
        </Card>

        {/* Global Error */}
        {globalError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {globalError}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="submit"
            isLoading={loading}
            onClick={handleSubmit}
            className="btn-hover-lift flex-1"
          >
            {!loading && (mode === 'create' ? 'إنشاء الشهادة' : 'حفظ التعديلات')}
          </Button>
          <Button asChild variant="outline" type="button">
            <Link href="/admin/certificates">إلغاء</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  type = 'text',
  value,
  onChange,
  error,
  placeholder,
  icon,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <div className="relative">
        {icon && (
          <div className="text-muted-foreground pointer-events-none absolute top-1/2 inset-s-3 -translate-y-1/2">
            {icon}
          </div>
        )}
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          error={!!error}
          required={label.includes('*')}
          className={icon ? 'ps-10' : ''}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
