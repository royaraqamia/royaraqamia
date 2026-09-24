'use client';

import { Search, ChevronLeft, ChevronRight, X, AlertTriangle, Unlock, Lock } from 'lucide-react';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Input } from '@/frontend/ui/primitives/input';
import { getBaseUrl } from '@/frontend/shared/get-base-url';

export interface AdminSystemLink {
  code: string;
  originalUrl: string;
  createdAt: string;
  userId: string | null;
  isBlocked: boolean;
  clickCount: number;
}

interface AdminLinksDirectoryProps {
  links: AdminSystemLink[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  page: number;
  totalPages: number;
  actionLoadingCode: string | null;
  moderateError: string | null;
  onDismissModerateError: () => void;
  onRequestBlock: (code: string, isBlocked: boolean) => void;
  onPageChange: (page: number) => void;
}

const PAGE_SIZE = 25;

function LinkRowActions({
  link,
  isModding,
  onRequestBlock,
}: {
  link: AdminSystemLink;
  isModding: boolean;
  onRequestBlock: (code: string, isBlocked: boolean) => void;
}) {
  return (
    <button
      onClick={() => onRequestBlock(link.code, link.isBlocked)}
      disabled={isModding}
      className={`px-3 py-2 font-bold text-xs rounded-full border transition-safe inline-flex items-center gap-1 cursor-pointer focus-ring btn-press touch-target ${
        link.isBlocked
          ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
          : 'bg-destructive/10 hover:bg-destructive/20 border-destructive/30 text-destructive'
      }`}
    >
      {isModding ? (
        <div
          className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
          role="status"
        />
      ) : link.isBlocked ? (
        <>
          <Unlock className="w-3 h-3" />
          <span>إلغاء حظر الرابط</span>
        </>
      ) : (
        <>
          <Lock className="w-3 h-3" />
          <span>حظر الرابط</span>
        </>
      )}
    </button>
  );
}

function LinkStatusBadge({ isBlocked }: { isBlocked: boolean }) {
  return isBlocked ? (
    <Badge variant="destructive">محظور</Badge>
  ) : (
    <Badge className="bg-success/10 text-success border-success/30">آمن</Badge>
  );
}

function PaginationControls({
  page,
  totalPages,
  resultCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  resultCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="border-border/50 flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <span className="text-muted-foreground text-xs font-medium">
        الصفحة {page + 1} من {totalPages} ({resultCount} نتيجة)
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="text-muted-foreground hover:text-primary hover:bg-muted focus-ring btn-press touch-target rounded-full p-1.5 transition-colors disabled:cursor-not-allowed"
          aria-label="الصفحة السابقة"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
          const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
          if (pageNum >= totalPages) return null;
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`focus-ring btn-press touch-target h-10 w-10 cursor-pointer rounded-full text-xs font-bold transition-colors ${
                pageNum === page
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {pageNum + 1}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="text-muted-foreground hover:text-primary hover:bg-muted focus-ring btn-press touch-target rounded-full p-1.5 transition-colors disabled:cursor-not-allowed"
          aria-label="الصفحة التالية"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AdminLinksDirectory({
  links,
  searchQuery,
  onSearchChange,
  page,
  totalPages,
  actionLoadingCode,
  moderateError,
  onDismissModerateError,
  onRequestBlock,
  onPageChange,
}: AdminLinksDirectoryProps) {
  const paginatedLinks = links.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="bg-card rounded-xl border border-border shadow-elevated overflow-hidden card-lift">
      {moderateError && (
        <div
          role="alert"
          aria-live="polite"
          className="bg-destructive/10 border-destructive/20 text-destructive mx-4 mt-4 flex items-center gap-2 rounded-lg border p-3 text-xs sm:mx-6"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{moderateError}</span>
          <button
            onClick={onDismissModerateError}
            aria-label="إغلاق"
            className="p-1 hover:bg-destructive/20 rounded-full transition-colors cursor-pointer focus-ring touch-target btn-press"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="border-border/50 flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-foreground text-sm font-bold">دليل الروابط المختصرة الكامل</h3>
          <Badge variant="outline">مزامنة قاعدة البيانات المباشرة</Badge>
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 inset-s-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="admin-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث بالرمز أو الرابط..."
            aria-label="بحث بالرمز أو الرابط"
            className="h-10 ps-9 text-xs"
          />
        </div>
      </div>

      {links.length === 0 ? (
        <div className="py-12 sm:py-16 text-center text-muted-foreground text-xs font-bold">
          {searchQuery ? 'لا توجد نتائج تطابق بحثك.' : 'لا توجد روابط مختصرة متاحة في الدليل.'}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground font-bold border-b border-border/50">
                  <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                    الرمز
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                    الوجهة المستهدفة
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                    النقرات
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                    الحالة الأمنية
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-6 sm:py-4 text-left">
                    إجراءات المراقبة
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedLinks.map((link) => {
                  const fullUrl = `${getBaseUrl()}/${link.code}`;
                  const isModding = actionLoadingCode === link.code;

                  return (
                    <tr key={link.code} className="hover:bg-muted/20">
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-mono font-bold text-primary">
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline cursor-pointer"
                        >
                          /{link.code}
                        </a>
                      </td>
                      <td
                        className="px-4 py-3 sm:px-6 sm:py-4 max-w-55 md:max-w-xs truncate text-muted-foreground font-mono"
                        title={link.originalUrl}
                      >
                        {link.originalUrl}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-center font-bold text-foreground">
                        {link.clickCount}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-center">
                        <LinkStatusBadge isBlocked={link.isBlocked} />
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                        <LinkRowActions
                          link={link}
                          isModding={isModding}
                          onRequestBlock={onRequestBlock}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-border/50">
            {paginatedLinks.map((link) => {
              const fullUrl = `${getBaseUrl()}/${link.code}`;
              const isModding = actionLoadingCode === link.code;

              return (
                <div key={link.code} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono font-bold text-primary hover:underline text-sm"
                    >
                      /{link.code}
                    </a>
                    <LinkStatusBadge isBlocked={link.isBlocked} />
                  </div>
                  <p
                    className="text-xs text-muted-foreground font-mono line-clamp-1"
                    title={link.originalUrl}
                  >
                    {link.originalUrl}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-bold">
                      {link.clickCount} نقرة
                    </span>
                    <button
                      onClick={() => onRequestBlock(link.code, link.isBlocked)}
                      disabled={isModding}
                      className={`px-3 py-1.5 font-bold text-xs rounded-full border transition-safe inline-flex items-center gap-1 cursor-pointer focus-ring btn-press touch-target ${
                        link.isBlocked
                          ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                          : 'bg-destructive/10 hover:bg-destructive/20 border-destructive/30 text-destructive'
                      }`}
                    >
                      {isModding ? (
                        <div
                          className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                          role="status"
                        />
                      ) : link.isBlocked ? (
                        <>
                          <Unlock className="w-3 h-3" />
                          <span>إلغاء حظر</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" />
                          <span>حظر</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <PaginationControls
              page={page}
              totalPages={totalPages}
              resultCount={links.length}
              onPageChange={onPageChange}
            />
          )}
        </>
      )}
    </div>
  );
}
