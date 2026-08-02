'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AdminErrorStateProps {
  error: string;
  onRetry: () => void;
}

export function AdminErrorState({ error, onRetry }: AdminErrorStateProps) {
  return (
    <div className="p-8 bg-destructive/5 border border-destructive/20 rounded-3xl text-center max-w-lg mx-auto space-y-4">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mx-auto">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-base font-bold text-foreground">الوصول الأمني الإداري</h2>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer focus-ring touch-target btn-press"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>إعادة محاولة التحقق</span>
      </button>
    </div>
  );
}
