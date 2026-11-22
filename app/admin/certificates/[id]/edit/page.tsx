'use client';

import { useReducer, useEffect, use } from 'react';
import Link from 'next/link';
import { CircleAlert, FileX } from 'lucide-react';
import { getCertificateById, updateCertificate } from '@/frontend/api/certificates';
import { CertificateForm } from '@/frontend/ui/admin/certificate-form';
import { PageLoader } from '@/frontend/ui/shared/page-loader';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { ApiError } from '@/frontend/transport/http';
import { certificateEditInitialState, certificateEditReducer } from './certificate-edit.reducer';

export default function EditCertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, dispatch] = useReducer(
    certificateEditReducer,
    undefined,
    certificateEditInitialState
  );
  const { loading, cert, loadFailure, reloadKey } = state;

  useEffect(() => {
    let mounted = true;
    dispatch({ type: 'loadStarted' });
    getCertificateById(id)
      .then((data) => {
        if (mounted) dispatch({ type: 'loaded', cert: data });
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        dispatch({
          type: 'loadFailed',
          failure: {
            offline: error instanceof ApiError && error.isNetworkError,
            message: error instanceof Error ? error.message : 'تعذّر تحميل الشهادة.',
          },
        });
      });
    return () => {
      mounted = false;
    };
  }, [id, reloadKey]);

  if (loading) {
    return <PageLoader />;
  }

  if (loadFailure) {
    const retry = () => dispatch({ type: 'reloadRequested' });

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
