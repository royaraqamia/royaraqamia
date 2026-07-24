'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getCertificates, deleteCertificate } from '@/lib/actions/admin-certificates';
import type { AdminCertificate } from '@/lib/actions/admin-certificates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { m, AnimatePresence } from 'motion/react';
import {
  Search,
  Trash2,
  Pencil,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  FileX,
  ChevronLeft,
  ChevronRight,
  Filter,
  GraduationCap,
} from 'lucide-react';

type StatusFilter = 'all' | 'valid' | 'expired';

const easeOut = [0.25, 0.4, 0.25, 1] as const;

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: easeOut },
  }),
};

export default function CertificatesListPage() {
  const [certificates, setCertificates] = useState<AdminCertificate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCertificate | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const pageSize = 20;

  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCertificates(page, pageSize, debouncedSearch);
      setCertificates(result.data);
      setTotal(result.total);
    } catch {
      setCertificates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      const result = await deleteCertificate(deleteTarget.id);
      if (result.success) {
        toast.success('تم حذف الشهادة بنجاح');
        await fetchData();
      } else {
        toast.error(result.error || 'فشل الحذف');
      }
    } catch {
      toast.error('حدث خطأ أثناء الحذف');
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(`https://royaraqamia.com/verify/${code}`);
    setCopiedId(id);
    toast.success('تم نسخ رابط التحقق');
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filtered = certificates.filter((cert) => {
    if (statusFilter === 'all') return true;
    const expired = cert.expiration_date && new Date(cert.expiration_date) < new Date();
    return statusFilter === 'expired' ? expired : !expired;
  });

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      {/* Search and Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setDebouncedSearch(search);
          }}
          className="relative flex-1 max-w-md"
        >
          <Search className="text-muted-foreground absolute top-1/2 inset-s-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرمز..."
            className="ps-10"
          />
        </form>
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground size-4" />
          {(['all', 'valid', 'expired'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                statusFilter === f
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {f === 'all' ? 'الكل' : f === 'valid' ? 'صالحة' : 'منتهية'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          إجمالي الشهادات: <span className="font-semibold text-foreground">{total}</span>
        </span>
        {total > 0 && (
          <span className="text-muted-foreground">
            الصفحة {page} من {totalPages || 1}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="text-primary size-8 animate-spin" />
            <p className="text-muted-foreground text-sm">جارٍ التحميل...</p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-4 py-16">
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
              <p className="font-semibold">لا توجد شهادات</p>
              <p className="text-muted-foreground text-sm mt-1">
                {search ? 'لا توجد نتائج تطابق البحث' : 'لم يتم إصدار أي شهادات بعد'}
              </p>
            </div>
            {!search && (
              <Button asChild>
                <Link href="/admin/certificates/new">إصدار شهادة جديدة</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((cert, i) => {
              const isExpired = cert.expiration_date && new Date(cert.expiration_date) < new Date();

              return (
                <m.div
                  key={cert.id}
                  custom={i}
                  variants={staggerItem}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                  layout
                >
                  <Card className="card-hover glass-card border-primary/5 transition-all duration-300 hover:border-primary/20">
                    <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
                      {/* Avatar */}
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
                        <ShieldCheck className="text-primary size-5" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-bold">{cert.student_name}</p>
                          <Badge
                            variant={isExpired ? 'destructive' : 'default'}
                            className="shrink-0 text-xs"
                          >
                            <span className="relative flex size-1.5 ml-1.5">
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
                          <GraduationCap className="size-3.5" />
                          <span className="truncate">{cert.course_name}</span>
                        </p>
                        <p className="text-muted-foreground font-mono text-xs mt-0.5">
                          {cert.certificate_code}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 gap-1 sm:justify-end">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyCode(cert.certificate_code, cert.id)}
                          aria-label="نسخ الرابط"
                          className="hover:text-primary"
                        >
                          {copiedId === cert.id ? (
                            <Check className="text-green-500 size-4" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          asChild
                          aria-label="عرض صفحة التحقق"
                          className="hover:text-primary"
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
                          className="hover:text-primary"
                        >
                          <Link href={`/admin/certificates/${cert.id}/edit`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <AlertDialog
                          open={deleteTarget?.id === cert.id}
                          onOpenChange={(open) => {
                            if (!open) setDeleteTarget(null);
                          }}
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={deleting === cert.id}
                              aria-label="حذف"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(cert)}
                            >
                              {deleting === cert.id ? (
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
                                <span className="font-semibold text-foreground">
                                  {deleteTarget?.student_name}
                                </span>
                                ؟ لا يمكن التراجع عن هذا الإجراء.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDelete}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                {deleting === deleteTarget?.id ? (
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
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-hover-lift"
          >
            <ChevronRight className="size-4" />
            السابق
          </Button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? 'default' : 'ghost'}
                  size="sm"
                  className="min-w-[36px]"
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-hover-lift"
          >
            التالي
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
