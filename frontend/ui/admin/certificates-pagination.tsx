'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';

interface CertificatesPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function CertificatesPagination({
  page,
  totalPages,
  onPageChange,
}: CertificatesPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-8 flex items-center justify-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
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
              className="min-w-9"
              onClick={() => onPageChange(pageNum)}
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
        onClick={() => onPageChange(page + 1)}
        className="btn-hover-lift"
      >
        التالي
        <ChevronLeft className="size-4" />
      </Button>
    </div>
  );
}
