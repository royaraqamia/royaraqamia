'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getCertificates, deleteCertificate } from '@/frontend/api/certificates';
import type { AdminCertificate } from '@/frontend/api/certificates';
import { isCertificateExpired } from '@/frontend/shared/format';
import { toast } from 'sonner';
import {
  CertificatesFilterBar,
  type StatusFilter,
} from '@/frontend/ui/admin/certificates-filter-bar';
import { CertificatesList } from '@/frontend/ui/admin/certificates-list';
import { Pagination } from '@/frontend/ui/shared/pagination';

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
    const expired = isCertificateExpired(cert.expiration_date);
    return statusFilter === 'expired' ? expired : !expired;
  });

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <CertificatesFilterBar
        search={search}
        statusFilter={statusFilter}
        onSearchChange={setSearch}
        onSearchSubmit={() => {
          setPage(1);
          setDebouncedSearch(search);
        }}
        onStatusFilterChange={setStatusFilter}
        action={
          <Link
            href="/admin/certificates/new"
            className="bg-primary hover:bg-primary/90 text-primary-foreground focus-visible:outline-ring btn-hover-lift inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
          >
            <Plus className="size-4" aria-hidden="true" />
            شهادة جديدة
          </Link>
        }
      />

      {/* Stats */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          إجمالي الشهادات: <span className="font-bold text-foreground">{total}</span>
        </span>
        {total > 0 && (
          <span className="text-muted-foreground">
            الصفحة {page} من {totalPages || 1}
          </span>
        )}
      </div>

      <CertificatesList
        certificates={filtered}
        loading={loading}
        hasSearch={!!search}
        deleting={deleting}
        copiedId={copiedId}
        deleteTarget={deleteTarget}
        onCopy={copyCode}
        onDeleteRequest={setDeleteTarget}
        onDeleteDialogChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirmDelete={handleDelete}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
