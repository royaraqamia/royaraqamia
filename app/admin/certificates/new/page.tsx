'use client';

import { CertificateForm } from '@/components/admin/certificate-form';
import { createCertificate } from '@/lib/actions/admin-certificates';

export default function NewCertificatePage() {
  return (
    <CertificateForm
      mode="create"
      onSubmit={async (data) => {
        return await createCertificate(data);
      }}
    />
  );
}
