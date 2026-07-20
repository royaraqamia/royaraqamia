'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  ShieldAlert,
  CalendarDays,
  GraduationCap,
  User,
  Hash,
  Clock,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import type { Certificate } from '@/lib/certificate-verification';
import { formatDateArabic } from '@/lib/utils';

export function VerifyClient({
  code,
  certificate,
}: {
  code: string;
  certificate: Certificate | null;
}) {
  if (!certificate) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
          <div className="mb-10 text-center">
            <div className="bg-destructive/10 mb-4 inline-flex items-center justify-center rounded-full p-4">
              <ShieldAlert className="text-destructive size-10" />
            </div>
            <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">شهادة غير موجودة</h1>
            <p className="text-muted-foreground mx-auto max-w-md text-base">
              لم يتمَّ العثور على شهادة بالرَّمز <span className="font-mono font-bold">{code}</span>
              .
            </p>
            <p className="text-muted-foreground mt-2 text-sm">تأكَّد من صحَّة الرَّمز.</p>
          </div>

          <Card className="glass-card">
            <CardContent className="flex flex-col items-center gap-4 py-10">
              <ShieldAlert className="text-destructive/50 size-16" />
              <p className="text-muted-foreground text-center text-sm">
                الرَّمز الذي أدخلته غير صالح أو غير موجود.
              </p>
              <Button asChild variant="outline">
                <Link href="/verify">
                  <ArrowRight className="size-4" />
                  المحاولة مرَّة أخرى
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const isExpired =
    certificate.expiration_date && new Date(certificate.expiration_date) < new Date();

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="bg-primary/10 mb-4 inline-flex items-center justify-center rounded-full p-4">
            <ShieldCheck className="text-primary size-10" />
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
            تمَّ التَّحقُّق بنجاح
          </h1>
          <p className="text-muted-foreground mx-auto max-w-md text-base">
            هذه الشَّهادة أصيلة وصادرة من رؤية رقمية
          </p>
        </div>

        {/* Certificate Card */}
        <Card className="glass-card overflow-hidden">
          {/* Verified Header */}
          <div className="bg-primary/10 flex items-center gap-3 border-b px-6 py-4">
            <div className="bg-primary flex size-10 items-center justify-center rounded-full">
              <ShieldCheck className="text-primary-foreground size-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg">شهادة موثَّقة</h2>
              <p className="text-muted-foreground text-sm">تمَّ التَّحقُّق من الأصالة</p>
            </div>
            <Badge variant={isExpired ? 'destructive' : 'default'} className="me-auto">
              {isExpired ? 'منتهية الصَّلاحيَّة' : 'صالحة'}
            </Badge>
          </div>

          {/* Certificate Details */}
          <CardContent className="pt-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <DetailRow
                icon={<Hash className="size-4" />}
                label="رمز الشهادة"
                value={certificate.certificate_code}
                highlight
              />
              <DetailRow
                icon={<User className="size-4" />}
                label="اسم الطالب"
                value={certificate.student_name}
              />
              <DetailRow
                icon={<GraduationCap className="size-4" />}
                label="اسم الدورة"
                value={certificate.course_name}
              />
              <DetailRow
                icon={<CalendarDays className="size-4" />}
                label="تاريخ الإصدار"
                value={formatDateArabic(certificate.issue_date)}
              />
              {certificate.expiration_date && (
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label="تاريخ الانتهاء"
                  value={formatDateArabic(certificate.expiration_date)}
                  danger={!!isExpired}
                />
              )}
              {certificate.grade_or_status && (
                <DetailRow
                  icon={<Trophy className="size-4" />}
                  label="الدرجة / الحالة"
                  value={certificate.grade_or_status}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Back Link */}
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/verify">
              <ArrowRight className="size-4" />
              التحقق من شهادة أخرى
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function DetailRow({
  icon,
  label,
  value,
  highlight = false,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`truncate text-sm font-semibold ${
            danger ? 'text-destructive' : highlight ? 'text-primary' : 'text-foreground'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
