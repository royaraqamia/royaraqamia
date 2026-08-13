'use client';

import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { Badge } from '@/frontend/ui/primitives/badge';
import type { Certificate } from '@/shared/contracts/certificates';
import { formatDateArabic, isCertificateExpired } from '@/frontend/shared/format';
import {
  ShieldCheck,
  CalendarDays,
  GraduationCap,
  User,
  Hash,
  Clock,
  Trophy,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { m } from 'motion/react';
import { detailVariants } from './verify-variants';

export function CertificateResultCard({
  certificate,
  copied,
  onCopy,
}: {
  certificate: Certificate;
  copied: boolean;
  onCopy: (val: string) => void;
}) {
  const isExpired = isCertificateExpired(certificate.expiration_date);

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
