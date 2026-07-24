'use client';

import { useState, type FormEvent, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { verifyCertificate } from '@/lib/actions/certificates';
import type { Certificate } from '@/lib/certificate-verification';
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
  Loader2,
  Copy,
  Check,
  Lock,
  ScanLine,
  Database,
  ArrowLeft,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const easeOut = [0.25, 0.4, 0.25, 1] as const;

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

const resultVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

const detailVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: easeOut },
  }),
};

const CERT_CODE_REGEX = /^COMP-\d{4}-[A-Z0-9]{8}$/;

export default function VerifyPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    certificate?: Certificate;
    error?: string;
    rateLimited?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isValidFormat, setIsValidFormat] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (code.length >= 5) {
      setIsValidFormat(CERT_CODE_REGEX.test(code.toUpperCase()));
    } else {
      setIsValidFormat(null);
    }
  }, [code]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await verifyCertificate(code);
      setResult(data);
    } catch {
      setResult({ success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' });
    } finally {
      setLoading(false);
    }
  }

  function copyCode(val: string) {
    navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <m.div
          className="absolute -top-40 right-20 h-96 w-96 rounded-full bg-[#7766EE] opacity-[0.08] blur-3xl"
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <m.div
          className="absolute -bottom-40 left-20 h-80 w-80 rounded-full bg-[#A78BFA] opacity-[0.06] blur-3xl"
          animate={{ scale: [1, 1.3, 1], x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        <m.div
          className="absolute top-1/3 left-1/4 h-64 w-64 rounded-full bg-[#6366F1] opacity-[0.04] blur-3xl"
          animate={{ scale: [1, 1.4, 1], opacity: [0.04, 0.08, 0.04] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-12 md:py-20">
        <m.div variants={containerVariants} initial="hidden" animate="visible">
          {/* Hero Section */}
          <div className="mb-12 text-center">
            <m.div variants={itemVariants} className="mb-6 inline-flex">
              <m.div
                className="relative flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7766EE] to-[#A78BFA] shadow-lg shadow-primary/25"
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

            <m.h1
              variants={itemVariants}
              className="mb-4 text-3xl font-bold tracking-tight md:text-4xl"
            >
              التَّحقُّق من <span className="gradient-text">الشَّهادة</span>
            </m.h1>

            <m.p
              variants={itemVariants}
              className="text-muted-foreground mx-auto max-w-lg text-base leading-relaxed"
            >
              أدخل رمز الشَّهادة للتَّحقُّق من صحَّتها وأصالتها في منظومة رؤية رقمية.
            </m.p>
          </div>

          {/* Search Card */}
          <m.div variants={cardVariants}>
            <Card className="glass-card relative overflow-hidden border-primary/10">
              <m.div
                className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-500"
                style={{
                  background:
                    'linear-gradient(120deg, rgba(139,92,246,0.08), rgba(99,102,241,0.04))',
                }}
                whileHover={{ opacity: 1 }}
              />
              <CardContent className="p-6 md:p-8">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row">
                  <div className="relative flex-1">
                    <Hash className="text-muted-foreground absolute top-1/2 inset-s-3 size-4 -translate-y-1/2" />
                    <Input
                      ref={inputRef}
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="COMP-2026-A1B2C3D4"
                      className="h-12 min-h-11 ps-10 text-base tracking-wider transition-all duration-300"
                      maxLength={30}
                      autoFocus
                      required
                    />
                    {isValidFormat === false && code.length >= 5 && (
                      <m.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-destructive mt-1.5 text-xs"
                      >
                        الصيغة الصحيحة: COMP-YYYY-XXXXXXXX
                      </m.p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    isLoading={loading}
                    className="btn-hover-lift sm:w-auto min-h-11"
                  >
                    {!loading && <Search className="size-4" />}
                    تحقُّق
                  </Button>
                </form>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <ScanLine className="size-3.5" />
                  <span>مثال: COMP-2026-A1B2C3D4</span>
                </div>
              </CardContent>
            </Card>
          </m.div>

          {/* Loading State */}
          <AnimatePresence>
            {loading && (
              <m.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-16"
              >
                <div className="relative">
                  <Loader2 className="text-primary size-10 animate-spin" />
                  <m.div
                    className="absolute inset-0 rounded-full"
                    animate={{
                      boxShadow: [
                        '0 0 0px rgba(119,102,238,0)',
                        '0 0 30px rgba(119,102,238,0.3)',
                        '0 0 0px rgba(119,102,238,0)',
                      ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                </div>
                <m.div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <m.div
                      key={i}
                      className="bg-primary size-2 rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </m.div>
                <p className="text-muted-foreground text-sm">جارٍ التَّحقُّق من الشَّهادة...</p>
              </m.div>
            )}
          </AnimatePresence>

          {/* Error / Rate Limited State */}
          <AnimatePresence>
            {!loading && result && !result.success && (
              <m.div
                key="error"
                variants={resultVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -20 }}
              >
                <Card className="overflow-hidden border-destructive/20">
                  <m.div
                    className="bg-destructive/10 flex flex-wrap items-center gap-3 border-b border-destructive/10 px-6 py-4"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <m.div
                      className="flex size-10 items-center justify-center rounded-full bg-destructive/20"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                    >
                      <AlertCircle className="text-destructive size-5" />
                    </m.div>
                    <div>
                      <h2 className="font-bold text-lg text-destructive">
                        {result.rateLimited ? 'طلبات كثيرة' : 'خطأ في التَّحقُّق'}
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        {result.rateLimited
                          ? 'الرجاء الانتظار قبل المحاولة مرة أخرى'
                          : 'تعذَّر التحقق من الشهادة'}
                      </p>
                    </div>
                  </m.div>
                  <CardContent className="pt-6">
                    <m.div
                      className="flex items-start gap-3 rounded-lg bg-destructive/5 px-4 py-3"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" />
                      <p className="text-sm">{result.error}</p>
                    </m.div>
                    <m.div
                      className="mt-4 flex justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResult(null);
                          setCode('');
                          inputRef.current?.focus();
                        }}
                      >
                        <ArrowLeft className="size-4" />
                        المحاولة مرة أخرى
                      </Button>
                    </m.div>
                  </CardContent>
                </Card>
              </m.div>
            )}
          </AnimatePresence>

          {/* Success State */}
          <AnimatePresence>
            {!loading && result?.success && result.certificate && (
              <m.div
                key="success"
                variants={resultVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -20 }}
              >
                <CertificateResultCard
                  certificate={result.certificate}
                  copied={copied}
                  onCopy={copyCode}
                />
              </m.div>
            )}
          </AnimatePresence>

          {/* Trust Footer */}
          <m.div variants={itemVariants} className="mt-16 border-t border-white/5 pt-8">
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" />
                اتصال مشفر SSL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                نظام توثيق رقمي
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="size-3.5" />
                التحقق آني من قاعدة البيانات
              </span>
            </div>
          </m.div>
        </m.div>
      </div>
    </div>
  );
}

function CertificateResultCard({
  certificate,
  copied,
  onCopy,
}: {
  certificate: Certificate;
  copied: boolean;
  onCopy: (val: string) => void;
}) {
  const isExpired =
    certificate.expiration_date && new Date(certificate.expiration_date) < new Date();

  const details = [
    {
      icon: <Hash className="size-4" />,
      label: 'رمز الشَّهادة',
      value: certificate.certificate_code,
      highlight: true,
      copyable: true,
    },
    { icon: <User className="size-4" />, label: 'اسم الطَّالب', value: certificate.student_name },
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
            danger: !!isExpired,
          } as const,
        ]
      : []),
    ...(certificate.grade_or_status
      ? [
          {
            icon: <Trophy className="size-4" />,
            label: 'الدَّرجة / الحالة',
            value: certificate.grade_or_status,
          } as const,
        ]
      : []),
  ];

  return (
    <Card className="card-hover glass-card overflow-hidden border-primary/10">
      <m.div
        className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent flex flex-wrap items-center gap-3 border-b border-primary/10 px-6 py-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <m.div
          className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/25"
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
        >
          <m.div
            className="absolute inset-0 rounded-full"
            animate={{
              boxShadow: [
                '0 0 0px rgba(34,197,94,0.4)',
                '0 0 20px rgba(34,197,94,0.6)',
                '0 0 0px rgba(34,197,94,0.4)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <ShieldCheck className="relative size-6 text-white" />
        </m.div>
        <div className="flex-1">
          <h2 className="font-bold text-lg">تمَّ التَّحقُّق بنجاح</h2>
          <p className="text-muted-foreground text-sm">هذه الشَّهادة أصيلة وصادرة من رؤية رقمية</p>
        </div>
        <m.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.3 }}
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
            {isExpired ? 'منتهية' : 'صالحة'}
          </Badge>
        </m.div>
      </m.div>

      <CardContent className="pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {details.map((detail, i) => (
            <m.div
              key={detail.label}
              custom={i}
              variants={detailVariants}
              initial="hidden"
              animate="visible"
              className="group flex items-start gap-3"
            >
              <div className="bg-muted/80 text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 group-hover:bg-primary/10 group-hover:text-primary">
                {detail.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">{detail.label}</p>
                <p
                  className={`truncate text-sm font-semibold ${
                    'danger' in detail && detail.danger
                      ? 'text-destructive'
                      : 'highlight' in detail && detail.highlight
                        ? 'text-primary'
                        : 'text-foreground'
                  }`}
                >
                  {'value' in detail ? detail.value : ''}
                </p>
              </div>
              {'copyable' in detail && detail.copyable && (
                <button
                  onClick={() => onCopy(detail.value ?? '')}
                  className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100"
                  aria-label="نسخ الرمز"
                >
                  {copied ? (
                    <Check className="size-4 text-green-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              )}
            </m.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
