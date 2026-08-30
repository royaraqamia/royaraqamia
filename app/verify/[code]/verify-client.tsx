'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
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
  ExternalLink,
  Search,
} from 'lucide-react';
import { m, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import type { PublicCertificate } from '@/shared/contracts/certificates';
import { formatDateArabic, isCertificateExpired } from '@/frontend/shared/format';
import { CertificateQRCodeClient } from '@/frontend/ui/certificate-qr-code-client';

const easeOut = [0.16, 1, 0.3, 1] as const;

const staggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: easeOut },
  },
};

export function VerifyClient({
  code,
  certificate,
}: {
  code: string;
  certificate: PublicCertificate | null;
}) {
  if (!certificate) {
    return <NotFoundState code={code} />;
  }

  return <CertificateFound certificate={certificate} />;
}

function NotFoundState({ code }: { code: string }) {
  const reduce = useReducedMotion() === true;
  return (
    <div
      dir="rtl"
      className="relative w-full overflow-x-hidden bg-background text-foreground flex items-center justify-center py-12 md:py-20 px-4 sm:px-6 lg:px-8 selection:bg-red-500/20 selection:text-red-500"
    >
      <div className="relative z-10 w-full max-w-2xl mx-auto">
        <m.div
          variants={staggerVariants}
          initial={reduce ? false : 'hidden'}
          animate="visible"
          className="flex flex-col items-center text-center"
        >
          {/* Top Status Pill */}
          <m.div variants={fadeUp} className="mb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3.5 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              خطأ في التَّحقُّق
            </span>
          </m.div>

          {/* Glowing Animated Icon */}
          <m.div variants={fadeUp} className="mb-6 relative">
            <div className="absolute inset-0 rounded-3xl bg-red-500/20 blur-xl transition-all duration-500" />
            <m.div
              className="relative flex size-20 md:size-24 items-center justify-center rounded-3xl bg-linear-to-br from-red-500 to-rose-700 shadow-xl shadow-red-500/25 ring-1 ring-white/20"
              initial={reduce ? false : { scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={reduce ? undefined : { type: 'spring', stiffness: 260, damping: 20 }}
            >
              <ShieldAlert className="size-10 md:size-12 text-white" />
            </m.div>
          </m.div>

          {/* Heading and Description */}
          <m.h1
            variants={fadeUp}
            className="mb-3 text-3xl font-extrabold tracking-tight md:text-4xl lg:text-5xl text-neutral-900 dark:text-neutral-50"
          >
            شهادة غير موجودة
          </m.h1>

          <m.p
            variants={fadeUp}
            className="text-neutral-600 dark:text-neutral-400 text-base md:text-lg max-w-lg leading-relaxed mb-8"
          >
            لم يتمَّ العثور على أي بيانات مسجَّلة برمز الشهادة:{' '}
            <span
              dir="ltr"
              className="inline-block font-mono font-bold text-neutral-900 dark:text-neutral-100 bg-neutral-200/60 dark:bg-neutral-800/80 px-2.5 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700"
            >
              {code}
            </span>
          </m.p>

          {/* Information Card */}
          <m.div variants={fadeUp} className="w-full">
            <Card className="glass-card relative overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/70 dark:bg-neutral-900/70 shadow-2xl shadow-neutral-950/5 backdrop-blur-xl">
              <CardContent className="flex flex-col items-center p-6 md:p-8 gap-6">
                <div className="flex items-center gap-3 text-start w-full p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                    <ShieldAlert className="size-5" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      الرَّمز المُدخل غير صالح أو انتهت صلاحيَّته
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      تأكَّد من إدخال الرَّمز كاملًا مع الشَّرطات والحرُوف الصحيحة (مثال:
                      COMP-2024-XXXXXX).
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full pt-2">
                  <Button
                    asChild
                    size="lg"
                    className="w-full sm:w-auto min-w-45 gap-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    <Link href="/verify">
                      <ArrowRight className="size-4" />
                      المحاولة مرَّة أخرى
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto min-w-40 gap-2 rounded-xl border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Link href="/">الصَّفحة الرَّئيسيَّة</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </m.div>
        </m.div>
      </div>
    </div>
  );
}

function CertificateFound({ certificate }: { certificate: PublicCertificate }) {
  const reduce = useReducedMotion() === true;
  const isExpired = isCertificateExpired(certificate.expiration_date);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const details = [
    {
      icon: <Hash className="size-4" />,
      label: 'رمز الشَّهادة',
      value: certificate.certificate_code,
      isCode: true,
    },
    {
      icon: <User className="size-4" />,
      label: 'اسم الطَّالب',
      value: certificate.student_name,
    },
    {
      icon: <GraduationCap className="size-4" />,
      label: 'اسم الدَّورة',
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
            isExp: true,
          },
        ]
      : []),
    ...(certificate.grade_or_status
      ? [
          {
            icon: <Trophy className="size-4" />,
            label: 'الدَّرجة / الحالة',
            value: certificate.grade_or_status,
          },
        ]
      : []),
  ];

  async function copyLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      let copiedWithFallback: boolean;
      try {
        copiedWithFallback = document.execCommand('copy');
      } catch {
        copiedWithFallback = false;
      }
      document.body.removeChild(textarea);
      if (!copiedWithFallback) return;
    }
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      dir="rtl"
      className="relative w-full overflow-x-hidden bg-background text-foreground py-10 md:py-20 px-4 sm:px-6 lg:px-8 selection:bg-primary/20 selection:text-primary"
    >
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .cert-print-card {
            box-shadow: none !important;
            border: 2px solid #000 !important;
            background: #fff !important;
            color: #000 !important;
          }
          .cert-print-card * {
            color: #000 !important;
            text-shadow: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-4xl mx-auto">
        <m.div variants={staggerVariants} initial={reduce ? false : 'hidden'} animate="visible">
          {/* Header Section */}
          <div className="mb-10 text-center flex flex-col items-center">
            {/* Glowing Icon Badge */}
            <m.div variants={fadeUp} className="mb-6 relative">
              <div className="absolute inset-0 rounded-3xl bg-primary/25 blur-xl transition-all duration-500" />
              <m.div
                className="relative flex size-20 md:size-24 items-center justify-center rounded-3xl bg-linear-to-br from-primary to-accent-purple shadow-xl shadow-primary/25 ring-1 ring-white/20"
                initial={reduce ? false : { scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={reduce ? undefined : { type: 'spring', stiffness: 220, damping: 18 }}
              >
                <ShieldCheck className="relative size-10 md:size-12 text-white" />
              </m.div>
            </m.div>

            <m.h1
              variants={fadeUp}
              className="mb-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl text-neutral-900 dark:text-neutral-50"
            >
              تمَّ التَّحقُّق{' '}
              <span className="bg-linear-to-r from-primary via-accent-indigo to-accent-purple bg-clip-text text-transparent">
                بنجاح
              </span>
            </m.h1>

            <m.p
              variants={fadeUp}
              className="text-neutral-600 dark:text-neutral-400 text-base md:text-lg max-w-md leading-relaxed"
            >
              هذه الشَّهادة أصيلة ومُوثَّقَة رسميًّا وتخضع لمعايير رؤية رقمية.
            </m.p>
          </div>

          {/* Certificate Main Display Card */}
          <m.div variants={fadeUp}>
            <div className="relative group">
              <Card className="cert-print-card relative overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/80 shadow-2xl shadow-neutral-950/5 backdrop-blur-2xl transition-all duration-500">
                {/* Visual Watermark */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03] dark:opacity-[0.04]">
                  <ShieldCheck className="size-96 text-primary" />
                </div>

                {/* Aesthetic Corner Brackets */}
                <div className="pointer-events-none absolute top-0 inset-s-0 size-12 md:size-16 border-t-2 border-s-2 border-primary/30 rounded-ss-3xl" />
                <div className="pointer-events-none absolute top-0 inset-e-0 size-12 md:size-16 border-t-2 border-e-2 border-primary/30 rounded-se-3xl" />
                <div className="pointer-events-none absolute bottom-0 inset-s-0 size-12 md:size-16 border-b-2 border-s-2 border-primary/30 rounded-es-3xl" />
                <div className="pointer-events-none absolute bottom-0 inset-e-0 size-12 md:size-16 border-b-2 border-e-2 border-primary/30 rounded-ee-3xl" />

                {/* Card Header Banner */}
                <div className="bg-linear-to-l from-primary/10 via-primary/5 to-transparent flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200/60 dark:border-neutral-800/60 px-6 md:px-8 py-5">
                  <div className="flex items-center gap-3.5">
                    <div className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-accent-purple text-white shadow-md shadow-primary/20">
                      <ShieldCheck className="size-6 text-white" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base md:text-lg text-neutral-900 dark:text-neutral-100">
                        شهادة مُوثَّقَة
                      </h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        صادرة عن رؤية رقمية
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={isExpired ? 'destructive' : 'success'}
                    className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl"
                  >
                    <span className="relative flex h-2 w-2">
                      {!isExpired && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      )}
                      <span
                        className={`relative inline-flex h-2 w-2 rounded-full ${
                          isExpired ? 'bg-red-500' : 'bg-primary'
                        }`}
                      />
                    </span>
                    {isExpired ? 'منتهية الصَّلاحيَّة' : 'صالحة ومُعتمَدَة'}
                  </Badge>
                </div>

                {/* Card Main Body */}
                <CardContent className="p-6 md:p-8">
                  <div className="grid gap-8 lg:grid-cols-12 items-stretch">
                    {/* Details List */}
                    <div className="lg:col-span-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-1">
                      {details.map((detail, i) => (
                        <m.div
                          key={detail.label}
                          custom={i}
                          initial={reduce ? false : { opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={
                            reduce
                              ? undefined
                              : { delay: 0.15 + i * 0.06, duration: 0.4, ease: easeOut }
                          }
                          className="group relative flex items-start gap-3.5 p-3.5 rounded-2xl bg-neutral-100/60 dark:bg-neutral-800/40 border border-neutral-200/50 dark:border-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-all duration-300"
                        >
                          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 shadow-xs border border-neutral-200/60 dark:border-neutral-700/60 group-hover:bg-primary group-hover:text-primary-foreground dark:group-hover:bg-primary dark:group-hover:text-primary-foreground transition-all duration-300">
                            {detail.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-0.5">
                              {detail.label}
                            </p>
                            <p
                              dir={detail.isCode ? 'ltr' : undefined}
                              title={detail.value}
                              className={`text-sm md:text-base font-bold truncate ${
                                detail.isCode
                                  ? 'font-mono text-primary tracking-wider text-right'
                                  : detail.isExp && isExpired
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-neutral-900 dark:text-neutral-100'
                              }`}
                            >
                              {detail.value}
                            </p>
                          </div>
                        </m.div>
                      ))}
                    </div>

                    {/* QR Code Seal Box */}
                    <m.div
                      className="lg:col-span-5 flex flex-col items-center justify-center gap-4 rounded-2xl bg-linear-to-b from-neutral-100/80 to-neutral-200/40 dark:from-neutral-800/50 dark:to-neutral-900/50 border border-neutral-200/80 dark:border-neutral-800/80 p-6 text-center shadow-inner"
                      initial={reduce ? false : { opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={reduce ? undefined : { delay: 0.35, duration: 0.4 }}
                    >
                      <div className="relative group/qr p-3 bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border border-neutral-200/80 dark:border-neutral-800 transition-transform duration-300 hover:scale-105">
                        <CertificateQRCodeClient
                          code={certificate.certificate_code}
                          size={150}
                          className="[&_svg]:w-36 [&_svg]:h-36 md:[&_svg]:w-40 md:[&_svg]:h-40"
                        />
                      </div>
                    </m.div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </m.div>

          {/* Action Dock Bar */}
          <m.div
            className="no-print mt-8 flex flex-wrap items-center justify-center gap-3"
            initial={reduce ? false : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? undefined : { delay: 0.5, duration: 0.4 }}
          >
            <span className="sr-only" role="status" aria-live="polite">
              {copied ? 'تمَّ نسخ رابط التَّحقُّق' : ''}
            </span>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="gap-2 rounded-xl border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Link href="/verify">
                <Search className="size-4" />
                التَّحقُّق من شهادة أخرى
              </Link>
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="gap-2 rounded-xl border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
              onClick={copyLink}
            >
              {copied ? (
                <Check className="size-4 text-primary animate-in zoom-in-50" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? 'تمَّ النَّسخ' : 'نسخ رابط التَّحقُّق'}
            </Button>

            <Button
              asChild
              variant="ghost"
              size="lg"
              className="gap-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-all duration-300"
            >
              <Link href="/">
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
