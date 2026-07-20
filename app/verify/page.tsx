'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { verifyCertificate, type Certificate } from '@/lib/actions/certificates';
import { formatDateArabic } from '@/lib/utils';
import {
  ShieldCheck,
  Search,
  AlertCircle,
  CalendarDays,
  GraduationCap,
  User,
  Hash,
  Clock,
  Trophy,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    certificate?: Certificate;
    error?: string;
  } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const data = await verifyCertificate(code);
      setResult(data);
    } catch {
      setResult({
        success: false,
        error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
      });
    } finally {
      setLoading(false);
    }
  }

  function handleDirectLink() {
    if (!code.trim()) return;
    router.push(`/verify/${code.trim().toUpperCase()}`);
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-full bg-primary/10 p-4">
            <ShieldCheck className="size-10 text-primary" />
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl font-heading">
            التَّحقُّق من الشَّهادة
          </h1>
          <p className="text-muted-foreground mx-auto max-w-md text-base">
            أدخل رمز الشَّهادة للتَّحقُّق من صحَّتها وأصالتها.
          </p>
        </div>

        {/* Search Form */}
        <Card className="glass-card mb-8">
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Hash className="text-muted-foreground absolute top-1/2 inset-s-3 size-4 -translate-y-1/2" />
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="COMP-2026-A1B2C"
                  className="h-12 min-h-[44px] ps-10 text-base tracking-wider"
                  maxLength={30}
                  autoFocus
                  required
                />
              </div>
              <Button
                type="submit"
                size="lg"
                isLoading={loading}
                className="sm:w-auto min-h-[44px]"
              >
                {!loading && <Search className="size-4" />}
                تحقُّق
              </Button>
            </form>

            <div className="mt-3 flex justify-center">
              <Button
                variant="link"
                size="sm"
                onClick={handleDirectLink}
                disabled={!code.trim()}
                className="text-muted-foreground text-xs min-h-[44px] py-2"
              >
                أو افتح الرَّابط المباشر
                <ArrowLeft className="size-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="text-primary size-8 animate-spin" />
            <p className="text-muted-foreground text-sm">جارٍ التَّحقُّق...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && result && !result.success && (
          <Alert variant="destructive" className="glass-card">
            <AlertCircle className="size-4" />
            <AlertTitle className="font-bold">خطأ في التَّحقُّق</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {!loading && result?.success && result.certificate && (
          <CertificateCard certificate={result.certificate} />
        )}
      </div>
    </main>
  );
}

function CertificateCard({ certificate }: { certificate: Certificate }) {
  const isExpired =
    certificate.expiration_date && new Date(certificate.expiration_date) < new Date();

  return (
    <Card className="glass-card overflow-hidden">
      {/* Verified Header */}
      <div className="bg-primary/10 flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <div className="bg-primary flex size-10 items-center justify-center rounded-full">
          <ShieldCheck className="text-primary-foreground size-5" />
        </div>
        <div>
          <h2 className="font-bold text-lg">تمَّ التَّحقُّق بنجاح</h2>
          <p className="text-muted-foreground text-sm">هذه الشَّهادة أصيلة وصادرة من رؤية رقمية</p>
        </div>
        <Badge variant={isExpired ? 'destructive' : 'default'} className="me-auto">
          {isExpired ? 'منتهية' : 'صالحة'}
        </Badge>
      </div>

      {/* Certificate Details */}
      <CardContent className="pt-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <DetailRow
            icon={<Hash className="size-4" />}
            label="رمز الشَّهادة"
            value={certificate.certificate_code}
            highlight
          />
          <DetailRow
            icon={<User className="size-4" />}
            label="اسم الطَّالب"
            value={certificate.student_name}
          />
          <DetailRow
            icon={<GraduationCap className="size-4" />}
            label="اسم الدَّورة"
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
              label="الدَّرجة / الحالة"
              value={certificate.grade_or_status}
            />
          )}
        </div>
      </CardContent>
    </Card>
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
