'use client';

import { useEffect, useCallback, useReducer, useRef } from 'react';
import Link from 'next/link';
import { CircleAlert, Plus } from 'lucide-react';
import { getCertificates, deleteCertificate } from '@/frontend/api/certificates';
import { isCertificateExpired } from '@/frontend/shared/format';
import { toast } from 'sonner';
import { ApiError } from '@/frontend/transport/http';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Button } from '@/frontend/ui/primitives/button';
import { CertificatesFilterBar } from '@/frontend/ui/admin/certificates-filter-bar';
import { CertificatesList } from '@/frontend/ui/admin/certificates-list';
import { Pagination } from '@/frontend/ui/shared/pagination';
import { certificatesListInitialState, certificatesListReducer } from './certificates-list.reducer';

export default function CertificatesListPage() {
  const [form, dispatch] = useReducer(
    certificatesListReducer,
    undefined,
    certificatesListInitialState
  );
  const {
    certificates,
    total,
    page,
    search,
    statusFilter,
    loading,
    deletingId,
    loadFailure,
    copiedId,
    deleteTarget,
  } = form;
  const debouncedSearch = form.debouncedSearch;
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const pageSize = 20;

  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      dispatch({ type: 'searchCommitted', search });
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [search]);

  const fetchData = useCallback(async () => {
    dispatch({ type: 'loadStarted' });
    try {
      const result = await getCertificates(page, pageSize, debouncedSearch);
      dispatch({ type: 'loaded', certificates: result.data, total: result.total });
    } catch (error) {
      dispatch({
        type: 'loadFailed',
        failure: {
          offline: error instanceof ApiError && error.isNetworkError,
          message: error instanceof Error ? error.message : 'تعذّر تحميل الشَّهادات.',
        },
      });
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    dispatch({ type: 'deleteStarted', id });
    try {
      const result = await deleteCertificate(id);
      if (result.success) {
        toast.success('تم حذف الشهادة بنجاح');
        await fetchData();
      } else {
        toast.error(result.error || 'فشل الحذف');
      }
    } catch {
      toast.error('حدث خطأ أثناء الحذف');
    } finally {
      dispatch({ type: 'deleteFinished' });
    }
  }

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(`https://royaraqamia.com/verify/${code}`);
    dispatch({ type: 'copyRaised', id });
    toast.success('تم نسخ رابط التحقق');
    setTimeout(() => dispatch({ type: 'copyCleared' }), 2000);
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
        onSearchChange={(search) => dispatch({ type: 'searchChanged', search })}
        onSearchSubmit={() => dispatch({ type: 'searchCommitted', search })}
        onStatusFilterChange={(statusFilter) =>
          dispatch({ type: 'statusFilterChanged', statusFilter })
        }
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

      {loadFailure ? (
        loadFailure.offline ? (
          <NeedsConnection
            message="تعذّر تحميل الشَّهادات: لم يصل الطَّلب إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
            onRetry={() => void fetchData()}
          />
        ) : (
          <EmptyState
            variant="card"
            icon={CircleAlert}
            title="تعذّر تحميل الشَّهادات"
            description={loadFailure.message}
            action={
              <Button type="button" onClick={() => void fetchData()} className="btn-hover-lift">
                إعادة المحاولة
              </Button>
            }
          />
        )
      ) : (
        <>
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
            deleting={deletingId}
            copiedId={copiedId}
            deleteTarget={deleteTarget}
            onCopy={copyCode}
            onDeleteRequest={(certificate) =>
              dispatch({ type: 'deleteTargetChanged', certificate })
            }
            onDeleteDialogChange={(open) => {
              if (!open) dispatch({ type: 'deleteTargetChanged', certificate: null });
            }}
            onConfirmDelete={handleDelete}
          />

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(page) => dispatch({ type: 'pageChanged', page })}
          />
        </>
      )}
    </div>
  );
}
