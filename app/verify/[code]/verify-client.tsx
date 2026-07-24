'use client';

import { useState } from 'react';
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
  Copy,
  Check,
  Printer,
  ExternalLink,
  Search,
} from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import type { Certificate } from '@/lib/certificate-verification';
import { formatDateArabic } from '@/lib/utils';
import { CertificateQRCodeClient } from '@/components/certificate-qr-code-client';

const easeOut = [0.25, 0.4, 0.25, 1] as const;

const staggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

export function VerifyClient({
  code,
  certificate,
}: {
  code: string;
  certificate: Certificate | null;
}) {
  if (!certificate) {
    return <NotFoundState code={code} />;
  }

  return <CertificateFound certificate={certificate} />;
}

function NotFoundState({ code }: { code: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <m.div
          className="absolute -top-40 left-20 h-80 w-80 rounded-full bg-destructive opacity-[0.06] blur-3xl"
          animate={{ scale: [1, 1.2, 1], x: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <m.div
          className="absolute -bottom-40 right-20 h-72 w-72 rounded-full bg-[#A78BFA] opacity-[0.04] blur-3xl"
          animate={{ scale: [1, 1.3, 1], x: [0, 20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-12 md:py-20">
        <m.div
          variants={staggerVariants}
          initial="hidden"
          animate="visible"
          className="text-center"
        >
          <m.div variants={fadeUp} className="mb-6 inline-flex">
            <m.div
              className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-destructive to-red-700 shadow-lg shadow-destructive/25"
              initial={{ scale: 0, rotate: 180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <ShieldAlert className="size-10 text-white" />
            </m.div>
          </m.div>

          <m.h1 variants={fadeUp} className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
            شهادة غير موجودة
          </m.h1>

          <m.p
            variants={fadeUp}
            className="text-muted-foreground mx-auto max-w-md text-base leading-relaxed"
          >
            لم يتمَّ العثور على شهادة بالرَّمز{' '}
            <span className="font-mono font-bold text-foreground">{code}</span>
          </m.p>

          <m.p variants={fadeUp} className="text-muted-foreground mt-2 text-sm">
            تأكَّد من صحَّة الرَّمز وحاول مرة أخرى.
          </m.p>
        </m.div>

        <m.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-8"
        >
          <Card className="glass-card overflow-hidden border-destructive/10">
            <CardContent className="flex flex-col items-center gap-5 py-12">
              <m.div
                className="flex size-16 items-center justify-center rounded-full bg-destructive/10"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <ShieldAlert className="text-destructive/60 size-8" />
              </m.div>
              <div className="text-center">
                <p className="text-muted-foreground text-sm">
                  الرَّمز الذي أدخلته غير صالح أو غير موجود في قاعدة البيانات.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  تأكد من إدخال الرمز كاملاً مع الشرطات (COMP-YYYY-XXXXXXXX).
                </p>
              </div>
              <div className="flex gap-3">
                <Button asChild variant="outline" className="btn-hover-lift">
                  <Link href="/verify">
                    <ArrowRight className="size-4" />
                    المحاولة مرَّة أخرى
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/">الصفحة الرئيسية</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </m.div>
      </div>
    </div>
  );
}

function CertificateFound({ certificate }: { certificate: Certificate }) {
  const [copied, setCopied] = useState(false);
  const isExpired =
    certificate.expiration_date && new Date(certificate.expiration_date) < new Date();

  const details = [
    {
      icon: <Hash className="size-4" />,
      label: 'رمز الشهادة',
      value: certificate.certificate_code,
    },
    { icon: <User className="size-4" />, label: 'اسم الطالب', value: certificate.student_name },
    {
      icon: <GraduationCap className="size-4" />,
      label: 'اسم الدورة',
      value: certificate.course_name,
    },
    {
      icon: <CalendarDays className="size-4" />,
      label: 'تاريخ الإصدار',
      value: formatDateArabic(certificate.issue_date),
    },
    ...(certificate.expiration_date
      ? [
          {
            icon: <Clock className="size-4" />,
            label: 'تاريخ الانتهاء',
            value: formatDateArabic(certificate.expiration_date),
          },
        ]
      : []),
    ...(certificate.grade_or_status
      ? [
          {
            icon: <Trophy className="size-4" />,
            label: 'الدرجة / الحالة',
            value: certificate.grade_or_status,
          },
        ]
      : []),
  ];

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .cert-print-card {
            box-shadow: none !important;
            border: 2px solid #333 !important;
            background: white !important;
            color: black !important;
          }
          .cert-print-card * {
            color: black !important;
          }
          .cert-print-card .gradient-text {
            background: none !important;
            -webkit-text-fill-color: black !important;
            color: black !important;
          }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 overflow-hidden no-print">
        <m.div
          className="absolute -top-40 right-20 h-96 w-96 rounded-full bg-[#7766EE] opacity-[0.08] blur-3xl"
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <m.div
          className="absolute -bottom-40 left-20 h-80 w-80 rounded-full bg-[#A78BFA] opacity-[0.06] blur-3xl"
          animate={{ scale: [1, 1.3, 1], x: [0, -30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        <m.div
          className="absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-green-500 opacity-[0.03] blur-3xl"
          animate={{ scale: [1, 1.4, 1], opacity: [0.03, 0.06, 0.03] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-12 md:py-20">
        <m.div variants={staggerVariants} initial="hidden" animate="visible">
          {/* Hero */}
          <div className="mb-10 text-center">
            <m.div variants={fadeUp} className="mb-6 inline-flex">
              <m.div
                className="relative flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-700 shadow-lg shadow-green-500/25"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, duration: 0.8 }}
              >
                <m.div
                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                />
                <ShieldCheck className="relative size-10 text-white" />
              </m.div>
            </m.div>

            <m.h1 variants={fadeUp} className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              تمَّ التَّحقُّق <span className="gradient-text">بنجاح</span>
            </m.h1>

            <m.p
              variants={fadeUp}
              className="text-muted-foreground mx-auto max-w-md text-base leading-relaxed"
            >
              هذه الشَّهادة أصيلة وصادرة من رؤية رقمية
            </m.p>
          </div>

          {/* Certificate Card */}
          <m.div variants={fadeUp}>
            <div className="certificate-container relative">
              <Card className="cert-print-card glass-card relative overflow-hidden border-primary/20">
                {/* Background watermark */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.02]">
                  <ShieldCheck className="size-64 text-primary" />
                </div>

                {/* Decorative corners */}
                <div className="pointer-events-none absolute top-0 left-0 size-16 border-t-2 border-l-2 border-primary/20 rounded-tl-xl" />
                <div className="pointer-events-none absolute top-0 right-0 size-16 border-t-2 border-r-2 border-primary/20 rounded-tr-xl" />
                <div className="pointer-events-none absolute bottom-0 left-0 size-16 border-b-2 border-l-2 border-primary/20 rounded-bl-xl" />
                <div className="pointer-events-none absolute bottom-0 right-0 size-16 border-b-2 border-r-2 border-primary/20 rounded-br-xl" />

                {/* Header */}
                <m.div
                  className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent flex flex-wrap items-center gap-3 border-b border-primary/10 px-6 py-5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <m.div
                    className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/25"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
                  >
                    <m.div
                      className="absolute inset-0 rounded-full"
                      animate={{
                        boxShadow: [
                          '0 0 0px rgba(34,197,94,0.4)',
                          '0 0 25px rgba(34,197,94,0.6)',
                          '0 0 0px rgba(34,197,94,0.4)',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <ShieldCheck className="relative size-6 text-white" />
                  </m.div>
                  <div className="flex-1">
                    <h2 className="font-bold text-lg">شهادة موثَّقة</h2>
                    <p className="text-muted-foreground text-sm">صادرة عن رؤية رقمية</p>
                  </div>
                  <m.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, delay: 0.35 }}
                  >
                    <Badge
                      variant={isExpired ? 'destructive' : 'default'}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
                    >
                      <span className="relative flex size-2">
                        {!isExpired && (
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
                        )}
                        <span
                          className={`relative inline-flex size-2 rounded-full ${
                            isExpired ? 'bg-destructive' : 'bg-green-500'
                          }`}
                        />
                      </span>
                      {isExpired ? 'منتهية الصَّلاحيَّة' : 'صالحة'}
                    </Badge>
                  </m.div>
                </m.div>

                <CardContent className="pt-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    {/* Details */}
                    <div className="space-y-4">
                      {details.map((detail, i) => (
                        <m.div
                          key={detail.label}
                          custom={i}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.08, duration: 0.4, ease: easeOut }}
                          className="group flex items-start gap-3"
                        >
                          <div className="bg-muted/80 text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 group-hover:bg-primary/10 group-hover:text-primary">
                            {detail.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-muted-foreground text-xs">{detail.label}</p>
                            <p
                              className={`truncate text-sm font-semibold ${
                                detail.label === 'رمز الشهادة'
                                  ? 'text-primary font-mono tracking-wider'
                                  : detail.label === 'تاريخ الانتهاء' && isExpired
                                    ? 'text-destructive'
                                    : 'text-foreground'
                              }`}
                            >
                              {detail.value}
                            </p>
                          </div>
                        </m.div>
                      ))}
                    </div>

                    {/* QR Code */}
                    <m.div
                      className="flex flex-col items-center justify-center gap-3 rounded-xl bg-muted/30 p-6"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                    >
                      <CertificateQRCodeClient
                        code={certificate.certificate_code}
                        size={140}
                        className="[&_svg]:w-[140px] [&_svg]:h-[140px]"
                      />
                      <div className="text-center">
                        <p className="text-muted-foreground text-xs">امسح الرمز للتحقق</p>
                        <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wider">
                          {certificate.certificate_code}
                        </p>
                      </div>
                    </m.div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </m.div>

          {/* Actions */}
          <m.div
            className="no-print mt-8 flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            <Button asChild variant="outline" className="btn-hover-lift">
              <Link href="/verify">
                <Search className="size-4" />
                التحقق من شهادة أخرى
              </Link>
            </Button>
            <Button variant="outline" className="btn-hover-lift" onClick={copyLink}>
              {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
              {copied ? 'تم النسخ' : 'نسخ رابط التحقق'}
            </Button>
            <Button variant="outline" className="btn-hover-lift" onClick={handlePrint}>
              <Printer className="size-4" />
              طباعة
            </Button>
            <Button asChild variant="ghost">
              <Link href="/" className="btn-hover-lift">
                <ExternalLink className="size-4" />
                رؤية رقمية
              </Link>
            </Button>
          </m.div>
        </m.div>
      </div>
    </div>
  );
}
