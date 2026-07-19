'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createCertificate } from '@/lib/actions/admin-certificates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

export default function NewCertificatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [form, setForm] = useState({
    student_name: '',
    course_name: '',
    issue_date: new Date().toISOString().split('T')[0] ?? '',
    expiration_date: '',
    grade_or_status: '',
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

    const result = await createCertificate({
      student_name: form.student_name,
      course_name: form.course_name,
      issue_date: form.issue_date,
      expiration_date: form.expiration_date || undefined,
      grade_or_status: form.grade_or_status || undefined,
    });

    if (result.success) {
      router.push('/admin/certificates');
      router.refresh();
    } else {
      setGlobalError(result.error || 'حدث خطأ');
      if (result.fieldErrors) setErrors(result.fieldErrors);
    }

    setLoading(false);
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

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">إصدار شهادة جديدة</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {globalError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {globalError}
              </div>
            )}

            <FormField
              label="اسم الطالب *"
              value={form.student_name}
              onChange={(v) => updateField('student_name', v)}
              error={errors.student_name}
              placeholder="أحمد محمد"
            />

            <FormField
              label="اسم الدورة *"
              value={form.course_name}
              onChange={(v) => updateField('course_name', v)}
              error={errors.course_name}
              placeholder="تطوير الويب الاحترافي"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="تاريخ الإصدار *"
                type="date"
                value={form.issue_date}
                onChange={(v) => updateField('issue_date', v)}
                error={errors.issue_date}
              />
              <FormField
                label="تاريخ الانتهاء"
                type="date"
                value={form.expiration_date}
                onChange={(v) => updateField('expiration_date', v)}
                error={errors.expiration_date}
              />
            </div>

            <FormField
              label="الدرجة / الحالة"
              value={form.grade_or_status}
              onChange={(v) => updateField('grade_or_status', v)}
              error={errors.grade_or_status}
              placeholder="ممتاز، جيد جداً، مكتمل..."
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" isLoading={loading} className="flex-1">
                {!loading && 'إنشاء الشهادة'}
              </Button>
              <Button asChild variant="outline" type="button">
                <Link href="/admin/certificates">إلغاء</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
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
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-foreground mb-1.5 block text-sm font-medium">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        error={!!error}
        required={label.includes('*')}
      />
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}
