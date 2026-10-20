'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { CircleAlert, FileX } from 'lucide-react';
import {
  getCertificateById,
  updateCertificate,
  type AdminCertificate,
} from '@/frontend/api/certificates';
import { CertificateForm } from '@/frontend/ui/admin/certificate-form';
import { PageLoader } from '@/frontend/ui/shared/page-loader';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { ApiError } from '@/frontend/transport/http';

export default function EditCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [cert, setCert] = useState<AdminCertificate | null>(null);
  const [loadFailure, setLoadFailure] = useState<{ offline: boolean; message: string } | null>(
    null
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadFailure(null);
    getCertificateById(id)
      .then((data) => {
        if (mounted) setCert(data);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setCert(null);
        setLoadFailure({
          offline: error instanceof ApiError && error.isNetworkError,
          message: error instanceof Error ? error.message : 'تعذّر تحميل الشهادة.',
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, reloadKey]);

  if (loading) {
    return <PageLoader />;
  }

  if (loadFailure) {
    const retry = () => setReloadKey((key) => key + 1);

    return loadFailure.offline ? (
      <NeedsConnection
        message="تعذّر تحميل الشهادة: لم يصل الطَّلب إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
        onRetry={retry}
      />
    ) : (
      <EmptyState
        variant="card"
        icon={CircleAlert}
        title="تعذّر تحميل الشهادة"
        description={loadFailure.message}
        action={
          <Button type="button" onClick={retry} className="btn-hover-lift">
            إعادة المحاولة
          </Button>
        }
      />
    );
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
