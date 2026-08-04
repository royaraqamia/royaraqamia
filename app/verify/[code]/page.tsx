import type { Metadata } from 'next';
import { loadCertificateByCode } from '@/backend/loaders/certificates';
import { formatDateArabic } from '@/frontend/shared/format';
import { VerifyClient } from './verify-client';

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const certificate = await loadCertificateByCode(code.trim().toUpperCase());

  if (!certificate) {
    return {
      title: 'شهادة غير موجودة',
      description: 'لم يتمَّ العثور على شهادة بهذا الرَّمز.',
    };
  }

  const title = `التَّحقُّق من شهادة ${certificate.student_name}`;
  const description = `شهادة ${certificate.course_name} صادرة لـ ${certificate.student_name} في ${formatDateArabic(certificate.issue_date)}. تم التحقق من أصالة هذه الشهادة عبر منصة رؤية رقمية.`;

  return {
    title,
    description,
    openGraph: {
      title: `التَّحقُّق من شهادة ${certificate.student_name} | رؤية رقمية`,
      description,
      url: `https://royaraqamia.com/verify/${certificate.certificate_code}`,
      siteName: 'رؤية رقمية',
      locale: 'ar_SY',
      type: 'website',
      images: [
        {
          url: '/OG Image.webp',
          width: 1200,
          height: 630,
          alt: `شهادة ${certificate.student_name} - رؤية رقمية`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `✓ تمَّ التَّحقُّق - ${certificate.student_name}`,
      description,
      images: ['/OG Image.webp'],
    },
  };
}

export default async function VerifyCodePage({ params }: PageProps) {
  const { code } = await params;
  const certificate = await loadCertificateByCode(code.trim().toUpperCase());

  return <VerifyClient code={code.trim().toUpperCase()} certificate={certificate} />;
}
