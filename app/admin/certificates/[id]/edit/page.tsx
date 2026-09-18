'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { FileX } from 'lucide-react';
import { getCertificateById, updateCertificate } from '@/frontend/api/certificates';
import type { AdminCertificate } from '@/frontend/api/certificates';
import { CertificateForm } from '@/frontend/ui/admin/certificate-form';
import { PageLoader } from '@/frontend/ui/shared/page-loader';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';

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
    return <PageLoader />;
  }

  if (!cert) {
    return (
      <EmptyState
        variant="card"
        icon={FileX}
        title="الشهادة غير موجودة"
        description="ربما تمَّ حذفها أو أنَّ الرَّابط غير صالح."
        action={
          <Button asChild className="btn-hover-lift">
            <Link href="/admin/certificates">العودة للقائمة</Link>
          </Button>
        }
      />
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
        recipient_user_ids: cert.recipient_user_ids,
      }}
      onSubmit={async (data) => {
        return await updateCertificate(id, data);
      }}
    />
  );
}
