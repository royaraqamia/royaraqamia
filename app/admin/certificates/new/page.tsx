'use client';

import { CertificateForm } from '@/frontend/ui/admin/certificate-form';
import { createCertificate } from '@/backend/controllers/certificates/admin';

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
