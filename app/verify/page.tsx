'use client';

import { useState, type FormEvent, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { verifyCertificate } from '@/backend/actions/certificates/verify';
import type { Certificate } from '@/backend/services/certificate-verification';
import { formatDateArabic } from '@/frontend/shared/utils';
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
  RotateCcw,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';

const easeOut = [0.16, 1, 0.3, 1] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.97, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

const resultVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: easeOut } },
};

const detailVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: easeOut },
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
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

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
      setResult({ success: false, error: 'حدث خطأ غير مُتوقَّع. الرَّجاء المحاولة مرَّة أخرى.' });
    } finally {
      setLoading(false);
    }
  }

  function copyCode(val: string) {
    navigator.clipboard.writeText(val);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* Dynamic Background Grid & Glowing Lighting */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] bg-size-[24px_24px] opacity-30" />
        <m.div
          className="absolute -top-32 right-1/4 h-125 w-125 rounded-full bg-linear-to-br from-indigo-500/15 via-purple-500/10 to-transparent blur-3xl"
          animate={{ scale: [1, 1.15, 1], x: [0, 25, 0], y: [0, -15, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <m.div
          className="absolute -bottom-32 left-1/4 h-112.5 w-112.5 rounded-full bg-linear-to-tr from-violet-500/15 via-fuchsia-500/10 to-transparent blur-3xl"
          animate={{ scale: [1, 1.2, 1], x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 md:py-20 lg:py-24">
        <m.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Hero Header Section */}
          <header className="text-center">
            <m.div
              variants={itemVariants}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 backdrop-blur-md"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="text-xs font-semibold tracking-wide text-primary">
                نظام التَّحقُّق الرَّقمي
              </span>
            </m.div>

            <m.div variants={itemVariants} className="mb-6 flex justify-center">
              <m.div
                className="relative flex size-20 items-center justify-center rounded-3xl bg-linear-to-br from-primary via-indigo-600 to-purple-700 shadow-xl shadow-primary/25 ring-8 ring-primary/10"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 18, duration: 0.8 }}
              >
                <ShieldCheck className="size-10 text-white" />
                <Sparkles className="absolute -top-1 -right-1 size-5 text-amber-300 animate-pulse" />
              </m.div>
            </m.div>

            <m.h1
              variants={itemVariants}
              className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl"
            >
              التَّحقُّق من{' '}
              <span className="bg-linear-to-r from-primary via-purple-600 to-indigo-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-300 dark:to-violet-400">
                الشَّهادة
              </span>
            </m.h1>

            <m.p
              variants={itemVariants}
              className="mt-4 mx-auto max-w-lg text-sm sm:text-base text-muted-foreground leading-relaxed"
            >
              أدخِل رمز الشَّهادة المطبوع على الوثيقة للتَّحقُّق من صحَّتها وأصالتها فورًا في رؤية
              رقمية.
            </m.p>
          </header>

          {/* Search Input Card */}
          <m.div variants={cardVariants}>
            <Card className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-1 shadow-2xl shadow-indigo-500/5 backdrop-blur-xl transition-all duration-300 hover:border-border">
              <CardContent className="p-5 sm:p-8">
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <div className="relative flex-1">
                    <div className="pointer-events-none absolute inset-y-0 inset-s-0 flex items-center ps-4">
                      <Hash
                        className={`size-5 transition-colors duration-200 ${code ? 'text-primary' : 'text-muted-foreground'}`}
                      />
                    </div>
                    <Input
                      ref={inputRef}
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="COMP-2026-A1B2C3D4"
                      className="h-13 w-full rounded-2xl border-border/70 bg-background/50 ps-11 pe-11 font-mono text-base tracking-wider uppercase shadow-xs backdrop-blur-sm transition-all duration-300 placeholder:font-sans placeholder:tracking-normal placeholder:normal-case focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/10 dark:bg-neutral-900/60"
                      maxLength={30}
                      autoFocus
                      required
                      aria-label="رمز الشَّهادة"
                    />
                    {isValidFormat === true && (
                      <div className="pointer-events-none absolute inset-y-0 inset-e-0 flex items-center pe-4">
                        <CheckCircle2 className="size-5 text-emerald-500 animate-in fade-in zoom-in-75 duration-200" />
                      </div>
                    )}
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    isLoading={loading}
                    disabled={loading || !code.trim()}
                    className="h-13 min-h-13 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/3 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 sm:w-auto w-full gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {!loading && <Search className="size-5" />}
                    <span>تحقُّق</span>
                  </Button>
                </form>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => {
                      setCode('COMP-2026-UHVW9SG5');
                      inputRef.current?.focus();
                    }}
                    className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    <ScanLine className="size-3.5 text-primary/80 transition-transform group-hover:scale-110" />
                    <span>مثال للتَّجربة:</span>
                    <code className="font-mono font-semibold text-primary transition-underline group-hover:underline">
                      COMP-2026-UHVW9SG5
                    </code>
                  </button>

                  {isValidFormat === false && code.length >= 5 && (
                    <m.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="inline-flex items-center gap-1.5 font-medium text-destructive bg-destructive/10 px-3 py-1 rounded-lg border border-destructive/20 text-xs"
                    >
                      <AlertCircle className="size-3.5 shrink-0" />
                      <span>الصِّيغة الصَّحيحة: COMP-YYYY-XXXXXXXX</span>
                    </m.div>
                  )}
                </div>
              </CardContent>
            </Card>
          </m.div>

          {/* Loading Indicator State */}
          <AnimatePresence>
            {loading && (
              <m.div
                key="loading"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                className="my-6 rounded-3xl border border-primary/20 bg-card/60 p-8 sm:p-12 text-center backdrop-blur-xl shadow-xl shadow-primary/5"
              >
                <div className="relative mx-auto flex size-20 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                  <div className="relative flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 shadow-inner">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                </div>
                <div className="mt-6 space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    جارٍ التَّحقُّق من أصالة الشَّهادة...
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    يتمُّ مطابقة السِّجلات الرَّقميَّة المُشفَّرة والتَّحقُّق من التَّوقيع المُعتمَد
                  </p>
                </div>
                <div className="mt-6 flex justify-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <m.div
                      key={i}
                      className="size-2 rounded-full bg-primary"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
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
                exit={{ opacity: 0, y: -20, transition: { duration: 0.15 } }}
                className="my-6"
              >
                <Card className="overflow-hidden rounded-3xl border-destructive/30 bg-card/90 shadow-2xl backdrop-blur-xl">
                  <div className="bg-destructive/10 border-b border-destructive/15 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive shadow-xs">
                        <AlertCircle className="size-6" />
                      </div>
                      <div>
                        <h2 className="font-bold text-lg text-destructive">
                          {result.rateLimited
                            ? 'تجاوز عدد المحاولات المسموحة'
                            : 'خطأ في التَّحقُّق'}
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {result.rateLimited
                            ? 'الرَّجاء الانتظار بضع دقائق قبل المحاولة مرَّة أخرى'
                            : 'تعذَّر العثور على شهادة بهذا الرَّمز في سجلاتنا'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="destructive" className="px-3 py-1 text-xs rounded-full">
                      {result.rateLimited ? 'محدود المؤقت' : 'غير مُسجَّلَة'}
                    </Badge>
                  </div>
                  <CardContent className="p-6 sm:p-8">
                    <div className="flex items-start gap-3 rounded-2xl bg-destructive/5 border border-destructive/15 p-4">
                      <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                      <p className="text-sm leading-relaxed text-foreground">{result.error}</p>
                    </div>
                    <div className="mt-6 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResult(null);
                          setCode('');
                          inputRef.current?.focus();
                        }}
                        className="gap-2 rounded-xl border-border hover:bg-muted cursor-pointer transition-all"
                      >
                        <RotateCcw className="size-4" />
                        <span>المحاولة مرَّة أخرى</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </m.div>
            )}
          </AnimatePresence>

          {/* Success Result State */}
          <AnimatePresence>
            {!loading && result?.success && result.certificate && (
              <m.div
                key="success"
                variants={resultVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -20, transition: { duration: 0.15 } }}
                className="my-6"
              >
                <CertificateResultCard
                  certificate={result.certificate}
                  copied={copied}
                  onCopy={copyCode}
                />
              </m.div>
            )}
          </AnimatePresence>

          {/* Trust Footer Section */}
          <m.footer variants={itemVariants} className="mt-16 border-t border-border/40 pt-8">
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground font-medium">
              <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40 transition-colors hover:border-primary/30">
                <Lock className="size-4 text-emerald-500" />
                <span>اتِّصال مُشفَّر SSL 256-bit</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40 transition-colors hover:border-primary/30">
                <ShieldCheck className="size-4 text-primary" />
                <span>نظام توثيق رقمي</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2 border border-border/40 transition-colors hover:border-primary/30">
                <Database className="size-4 text-indigo-500" />
                <span>فحص آني في قاعدة البيانات</span>
              </div>
            </div>
          </m.footer>
        </m.div>
      </div>
    </main>
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
    <Card className="group relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-card/90 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-emerald-500/40">
      {/* Accent Background Glows */}
      <div className="pointer-events-none absolute -top-24 -inset-e-24 size-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -inset-s-24 size-80 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Top Banner Header */}
      <m.div
        className="relative flex flex-wrap items-center justify-between gap-4 border-b border-border/50 bg-linear-to-r from-emerald-500/10 via-emerald-500/5 to-transparent px-6 py-5 sm:px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-4">
          <m.div
            className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-500/20"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}
          >
            <ShieldCheck className="size-7 text-white" />
          </m.div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                تمَّ التَّحقُّق بنجاح
              </h2>
              <Sparkles className="size-4 text-amber-500 animate-pulse" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              هذه الشَّهادة أصيلة ومُوثَّقة رسميًّا في سجلات رؤية رقمية
            </p>
          </div>
        </div>

        <m.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.25 }}
        >
          <Badge
            variant={isExpired ? 'destructive' : 'default'}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-full shadow-xs ${
              isExpired
                ? 'bg-destructive/15 text-destructive border border-destructive/30'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
            }`}
          >
            <span className="relative flex size-2">
              {!isExpired && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex size-2 rounded-full ${
                  isExpired ? 'bg-destructive' : 'bg-emerald-500'
                }`}
              />
            </span>
            {isExpired ? 'شهادة منتهية' : 'شهادة صالحة ومُوثَّقة'}
          </Badge>
        </m.div>
      </m.div>

      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Main Certificate Showcase Highlight Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-linear-to-br from-primary/5 via-primary/2 to-transparent p-5 sm:p-6 backdrop-blur-sm">
          <div className="pointer-events-none absolute -inset-e-6 -bottom-6 opacity-[0.04] dark:opacity-[0.06]">
            <GraduationCap className="size-44 text-primary" />
          </div>

          <div className="grid gap-6 sm:grid-cols-2 relative z-10">
            {/* Student Info */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <User className="size-3.5 text-primary" />
                <span>اسم الطَّالب / الحاصل على الشَّهادة</span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight leading-snug">
                {certificate.student_name}
              </p>
            </div>

            {/* Course Info */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <GraduationCap className="size-3.5 text-primary" />
                <span>اسم الدَّورة / البرنامج التَّدريبي</span>
              </div>
              <p className="text-base sm:text-lg font-bold text-foreground leading-snug">
                {certificate.course_name}
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Items Grid */}
        <div className="grid gap-3.5 sm:grid-cols-2">
          {details.map((detail, i) => (
            <m.div
              key={detail.label}
              custom={i}
              variants={detailVariants}
              initial="hidden"
              animate="visible"
              className="group/item relative flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/60 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-background/90 hover:shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground transition-colors duration-200 group-hover/item:bg-primary/10 group-hover/item:text-primary">
                  {detail.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">{detail.label}</p>
                  <p
                    className={`truncate text-sm font-semibold mt-0.5 ${
                      'danger' in detail && detail.danger
                        ? 'text-destructive'
                        : 'highlight' in detail && detail.highlight
                          ? 'font-mono tracking-wider text-primary'
                          : 'text-foreground'
                    }`}
                  >
                    {'value' in detail ? detail.value : ''}
                  </p>
                </div>
              </div>

              {'copyable' in detail && detail.copyable && (
                <button
                  type="button"
                  onClick={() => onCopy(detail.value ?? '')}
                  className="relative inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary cursor-pointer active:scale-95 shrink-0"
                  aria-label="نسخ رمز الشَّهادة"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-semibold">تمَّ النَّسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>نسخ</span>
                    </>
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
