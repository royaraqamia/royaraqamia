import type { Metadata } from 'next';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { VerifyClient } from './verify-client';

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const certificate = await getCertificate(code.trim().toUpperCase());

  if (!certificate) {
    return {
      title: 'شهادة غير موجودة | رؤية رقمية',
      description: 'لم يتم العثور على شهادة بهذا الرمز.',
    };
  }

  const title = ` التحقق من شهادة ${certificate.student_name} | رؤية رقمية`;
  const description = `شهادة ${certificate.course_name} صادرة لـ ${certificate.student_name} في ${formatDate(certificate.issue_date)}. تم التحقق من أصالة هذه الشهادة عبر منصة رؤية رقمية.`;

  return {
    title,
    description,
    openGraph: {
      title: `✓ تم التحقق - ${certificate.student_name}`,
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
      title: `✓ تم التحقق - ${certificate.student_name}`,
      description,
      images: ['/OG Image.webp'],
    },
  };
}

export default async function VerifyCodePage({ params }: PageProps) {
  const { code } = await params;
  const certificate = await getCertificate(code.trim().toUpperCase());

  return <VerifyClient code={code.trim().toUpperCase()} certificate={certificate} />;
}

async function getCertificate(code: string) {
  const admin = getAdminSupabase();

  const { data, error } = await admin
    .from('certificates')
    .select('*')
    .eq('certificate_code', code)
    .single();

  if (error || !data) return null;
  return data as CertificateData;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface CertificateData {
  id: string;
  certificate_code: string;
  student_name: string;
  course_name: string;
  issue_date: string;
  expiration_date: string | null;
  grade_or_status: string | null;
  created_at: string;
}
