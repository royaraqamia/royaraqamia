'use client';

import { AlertTriangle } from 'lucide-react';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';

interface AdminErrorStateProps {
  error: string;
  onRetry: () => void;
}

export function AdminErrorState({ error, onRetry }: AdminErrorStateProps) {
  return (
    <div className="bg-destructive/5 border-destructive/20 mx-auto max-w-lg space-y-4 rounded-3xl border p-6 text-center sm:p-8">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mx-auto">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-base font-bold text-foreground">الوصول الأمني الإداري</h2>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
      <HeroCtaButton type="button" onClick={onRetry} className="mx-auto">
        <span>إعادة محاولة التحقق</span>
      </HeroCtaButton>
    </div>
  );
}
