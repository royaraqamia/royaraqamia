'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCertificateById, updateCertificate } from '@/lib/actions/admin-certificates';
import type { AdminCertificate } from '@/lib/actions/admin-certificates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Loader2, ExternalLink, Copy, Check } from 'lucide-react';

export default function EditCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [cert, setCert] = useState<AdminCertificate | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    student_name: '',
    course_name: '',
    issue_date: '',
    expiration_date: '',
    grade_or_status: '',
  });

  useEffect(() => {
    getCertificateById(id).then((data) => {
      if (data) {
        setCert(data);
        setForm({
          student_name: data.student_name,
          course_name: data.course_name,
          issue_date: data.issue_date,
          expiration_date: data.expiration_date || '',
          grade_or_status: data.grade_or_status || '',
        });
      }
      setLoading(false);
    });
  }, [id]);

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
    setSaving(true);
    setGlobalError('');

    const result = await updateCertificate(id, {
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

    setSaving(false);
  }

  function copyLink() {
    if (!cert) return;
    navigator.clipboard.writeText(`https://royaraqamia.com/verify/${cert.certificate_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-primary size-8 animate-spin" />
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">الشهادة غير موجودة</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/certificates">العودة للقائمة</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/certificates">
            <ArrowRight className="size-4" />
            العودة للقائمة
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
            نسخ الرابط
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/verify/${cert.certificate_code}`} target="_blank">
              <ExternalLink className="size-4" />
              صفحة التحقق
            </Link>
          </Button>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-lg">
            تعديل الشهادة
            <span className="text-muted-foreground font-mono text-sm">{cert.certificate_code}</span>
          </CardTitle>
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
            />

            <FormField
              label="اسم الدورة *"
              value={form.course_name}
              onChange={(v) => updateField('course_name', v)}
              error={errors.course_name}
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
              <Button type="submit" isLoading={saving} className="flex-1">
                {!saving && 'حفظ التعديلات'}
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
