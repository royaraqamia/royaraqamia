'use client';

import { CertificateForm } from '@/frontend/ui/admin/certificate-form';
import { createCertificate } from '@/frontend/api/certificates';

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
