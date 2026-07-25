'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link2, RefreshCw, AlertTriangle } from 'lucide-react';
import { LinkRowCard } from './link-row-card';
import { DashboardEmptyState } from './dashboard-empty-state';
import { DashboardSkeleton } from '@/components/linksnap/loading-skeletons';

interface LinkItem {
  code: string;
  originalUrl: string;
  createdAt: string;
  isBlocked: boolean;
}

interface LinkDashboardProps {
  token: string;
  refreshTrigger: number;
}

export function LinkDashboard({ token, refreshTrigger }: LinkDashboardProps) {
  const reducedMotion = useReducedMotion();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/linksnap/api/links', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch links');
      setLinks(data.links);
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل روابطك المختصرة.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => fetchLinks(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [token, refreshTrigger, fetchLinks]);

  const handleDelete = (code: string) => {
    setLinks(links.filter((l) => l.code !== code));
  };

  const handleUpdate = (code: string, newUrl: string) => {
    setLinks(links.map((l) => (l.code === code ? { ...l, originalUrl: newUrl } : l)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Link2 aria-hidden="true" className="w-5 h-5 text-primary" />
          <span>روابطك المختصرة</span>
        </h2>
        <button
          onClick={fetchLinks}
          disabled={loading}
          aria-label="تحديث القائمة"
          className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted transition-colors cursor-pointer press-scale focus-ring touch-target btn-press"
          title="تحديث القائمة"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            role={loading ? 'status' : undefined}
          />
        </button>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div
          aria-live="polite"
          className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl flex items-center gap-2"
        >
          <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={fetchLinks}
            className="px-3 py-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive font-semibold text-xs rounded-lg transition-colors cursor-pointer btn-press shrink-0 focus-ring touch-target"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : links.length === 0 ? (
        <DashboardEmptyState />
      ) : (
        <motion.div
          initial={reducedMotion ? 'visible' : 'hidden'}
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.06 } },
          }}
          className="space-y-4"
        >
          {links.map((link) => (
            <motion.div
              key={link.code}
              variants={{
                hidden: reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <LinkRowCard
                code={link.code}
                originalUrl={link.originalUrl}
                createdAt={link.createdAt}
                isBlocked={link.isBlocked}
                token={token}
                onDeleted={handleDelete}
                onUpdated={handleUpdate}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
