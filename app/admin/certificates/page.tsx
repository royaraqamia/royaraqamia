'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getCertificates, deleteCertificate } from '@/lib/actions/admin-certificates';
import type { AdminCertificate } from '@/lib/actions/admin-certificates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Trash2,
  Pencil,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export default function CertificatesListPage() {
  const [certificates, setCertificates] = useState<AdminCertificate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getCertificates(page, 20, search);
    setCertificates(result.data);
    setTotal(result.total);
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchData();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`هل أنت متأكد من حذف شهادة "${name}"؟`)) return;
    setDeleting(id);
    await deleteCertificate(id);
    await fetchData();
    setDeleting(null);
  }

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(`https://royaraqamia.com/verify/${code}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 start-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرمز..."
            className="ps-10"
          />
        </div>
        <Button type="submit" variant="outline">
          بحث
        </Button>
      </form>

      {/* Stats */}
      <div className="mb-4 text-sm text-muted-foreground">إجمالي الشهادات: {total}</div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-primary size-8 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && certificates.length === 0 && (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <AlertCircle className="text-muted-foreground size-12" />
            <p className="text-muted-foreground">لا توجد شهادات{search ? ' تطابق البحث' : ''}</p>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {!loading && certificates.length > 0 && (
        <div className="space-y-3">
          {certificates.map((cert) => {
            const isExpired = cert.expiration_date && new Date(cert.expiration_date) < new Date();

            return (
              <Card key={cert.id} className="glass-card">
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Icon */}
                  <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-full">
                    <ShieldCheck className="text-primary size-5" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold">{cert.student_name}</p>
                      <Badge variant={isExpired ? 'destructive' : 'default'} className="shrink-0">
                        {isExpired ? 'منتهية' : 'صالحة'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground truncate text-sm">{cert.course_name}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {cert.certificate_code}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyCode(cert.certificate_code, cert.id)}
                      title="نسخ الرابط"
                    >
                      {copiedId === cert.id ? (
                        <Check className="text-green-500 size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon-sm" asChild title="عرض صفحة التحقق">
                      <Link href={`/verify/${cert.certificate_code}`} target="_blank">
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon-sm" asChild title="تعديل">
                      <Link href={`/admin/certificates/${cert.id}/edit`}>
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(cert.id, cert.student_name)}
                      disabled={deleting === cert.id}
                      title="حذف"
                      className="text-destructive hover:text-destructive"
                    >
                      {deleting === cert.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            السابق
          </Button>
          <span className="text-muted-foreground px-4 text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
