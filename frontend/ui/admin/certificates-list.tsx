'use client';

import Link from 'next/link';
import type { Certificate } from '@/shared/contracts/certificates';
import { isCertificateExpired } from '@/frontend/shared/format';
import { Button } from '@/frontend/ui/primitives/button';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/frontend/ui/primitives/alert-dialog';
import { m, AnimatePresence } from 'motion/react';
import {
  Trash2,
  Pencil,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  FileX,
  GraduationCap,
} from 'lucide-react';

const easeOut = [0.25, 0.4, 0.25, 1] as const;

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: easeOut },
  }),
};

export interface CertificatesListItemProps {
  cert: Certificate;
  deleting: boolean;
  copied: boolean;
  onCopy: (code: string, id: string) => void;
  onDeleteRequest: (cert: Certificate) => void;
  onDeleteDialogChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isDeleteTarget: boolean;
}

function CertificateListItem({
  cert,
  deleting,
  copied,
  onCopy,
  onDeleteRequest,
  onDeleteDialogChange,
  onConfirmDelete,
  isDeleteTarget,
}: CertificatesListItemProps) {
  const isExpired = isCertificateExpired(cert.expiration_date);

  return (
    <m.div
      key={cert.id}
      custom={0}
      variants={staggerItem}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      layout
    >
      <Card className="card-hover glass-card border-primary/5 hover:border-primary/20 transition-safe duration-300">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Avatar */}
            <div className="from-primary/20 to-primary/10 flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br sm:size-10">
              <ShieldCheck className="text-primary size-5" aria-hidden="true" />
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold">{cert.student_name}</p>
                <Badge variant={isExpired ? 'destructive' : 'default'} className="shrink-0 text-xs">
                  <span className="relative ms-1.5 flex size-1.5">
                    {!isExpired && (
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex size-1.5 rounded-full ${
                        isExpired ? 'bg-destructive-foreground' : 'bg-green-500'
                      }`}
                    />
                  </span>
                  {isExpired ? 'منتهية' : 'صالحة'}
                </Badge>
              </div>
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <GraduationCap className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{cert.course_name}</span>
              </p>
              <p className="text-muted-foreground mt-0.5 font-mono text-xs" dir="ltr">
                {cert.certificate_code}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="border-border/50 flex shrink-0 items-center gap-1 border-t pt-3 sm:justify-end sm:border-t-0 sm:pt-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onCopy(cert.certificate_code, cert.id)}
              aria-label="نسخ الرابط"
              className="hover:text-primary size-11 sm:size-10"
            >
              {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              aria-label="عرض صفحة التحقق"
              className="hover:text-primary size-11 sm:size-10"
            >
              <Link href={`/verify/${cert.certificate_code}`} target="_blank">
                <ExternalLink className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              asChild
              aria-label="تعديل"
              className="hover:text-primary size-11 sm:size-10"
            >
              <Link href={`/admin/certificates/${cert.id}/edit`}>
                <Pencil className="size-4" />
              </Link>
            </Button>
            <AlertDialog open={isDeleteTarget} onOpenChange={onDeleteDialogChange}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={deleting}
                  aria-label="حذف"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 size-11 sm:size-10"
                  onClick={() => onDeleteRequest(cert)}
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من حذف شهادة{' '}
                    <span className="font-bold text-foreground">{cert.student_name}</span>؟ لا يمكن
                    التراجع عن هذا الإجراء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onConfirmDelete}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        جاري الحذف...
                      </>
                    ) : (
                      'حذف'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}

interface CertificatesListProps {
  certificates: Certificate[];
  loading: boolean;
  hasSearch: boolean;
  deleting: string | null;
  copiedId: string | null;
  deleteTarget: Certificate | null;
  onCopy: (code: string, id: string) => void;
  onDeleteRequest: (cert: Certificate) => void;
  onDeleteDialogChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}

export function CertificatesList({
  certificates,
  loading,
  hasSearch,
  deleting,
  copiedId,
  deleteTarget,
  onCopy,
  onDeleteRequest,
  onDeleteDialogChange,
  onConfirmDelete,
}: CertificatesListProps) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="جارٍ تحميل الشهادات">
        {[0, 1, 2, 3].map((key) => (
          <Card key={key} className="glass-card">
            <CardContent className="flex items-center gap-3 py-4">
              <Skeleton className="size-11 shrink-0 rounded-full sm:size-10" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-56 max-w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="flex flex-col items-center gap-4 py-14 sm:py-16">
          <m.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <FileX className="text-muted-foreground size-8" />
            </div>
          </m.div>
          <div className="text-center">
            <p className="font-bold">لا توجد شهادات</p>
            <p className="text-muted-foreground text-sm mt-1">
              {hasSearch ? 'لا توجد نتائج تطابق البحث' : 'لم يتم إصدار أي شهادات بعد'}
            </p>
          </div>
          {!hasSearch && (
            <Button asChild>
              <Link href="/admin/certificates/new">إصدار شهادة جديدة</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {certificates.map((cert) => (
          <CertificateListItem
            key={cert.id}
            cert={cert}
            deleting={deleting === cert.id}
            copied={copiedId === cert.id}
            onCopy={onCopy}
            onDeleteRequest={onDeleteRequest}
            onDeleteDialogChange={onDeleteDialogChange}
            onConfirmDelete={onConfirmDelete}
            isDeleteTarget={deleteTarget?.id === cert.id}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
