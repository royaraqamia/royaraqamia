'use client';

import { useState, useEffect, use } from 'react';
import { getCertificateById, updateCertificate } from '@/lib/actions/admin-certificates';
import type { AdminCertificate } from '@/lib/actions/admin-certificates';
import { CertificateForm } from '@/components/admin/certificate-form';
import { Loader2 } from 'lucide-react';

export default function EditCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [cert, setCert] = useState<AdminCertificate | null>(null);

  useEffect(() => {
    let mounted = true;
    getCertificateById(id)
      .then((data) => {
        if (mounted && data) setCert(data);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="text-primary size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">جارٍ تحميل بيانات الشهادة...</p>
        </div>
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">الشهادة غير موجودة</p>
      </div>
    );
  }

  return (
    <CertificateForm
      mode="edit"
      initialData={{
        id: cert.id,
        certificate_code: cert.certificate_code,
        student_name: cert.student_name,
        course_name: cert.course_name,
        issue_date: cert.issue_date,
        expiration_date: cert.expiration_date,
        grade_or_status: cert.grade_or_status,
      }}
      onSubmit={async (data) => {
        return await updateCertificate(id, data);
      }}
    />
  );
}
