'use client';

import { useState } from 'react';
import { Link, Layers } from 'lucide-react';
import { SingleUrlShortener } from './single-url-shortener';
import { BulkUrlShortener } from './bulk-url-shortener';

interface UrlShortenerProps {
  token: string | null;
  onLinkCreated: () => void;
}

export function UrlShortener({ token, onLinkCreated }: UrlShortenerProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [tabKey, setTabKey] = useState(0);

  const switchTab = (tab: 'single' | 'bulk') => {
    setActiveTab(tab);
    setTabKey((k) => k + 1);
  };

  return (
    <div className="w-full bg-card p-5 sm:p-8 rounded-3xl border border-border shadow-elevated card-lift">
      {token && (
        <div
          className="flex bg-muted/50 border border-border p-1 rounded-xl mb-6"
          role="tablist"
          aria-label="اختيار طريقة الاختصار"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'single'}
            onClick={() => switchTab('single')}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer press-scale focus-ring touch-target btn-press ${
              activeTab === 'single'
                ? 'bg-card text-foreground shadow-sm border border-border/50 font-bold'
                : 'text-muted-foreground hover:text-foreground font-medium'
            }`}
          >
            <Link className="w-3.5 h-3.5 text-primary" />
            <span>رابط واحد</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bulk'}
            onClick={() => switchTab('bulk')}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer press-scale focus-ring touch-target btn-press ${
              activeTab === 'bulk'
                ? 'bg-card text-foreground shadow-sm border border-border/50 font-bold'
                : 'text-muted-foreground hover:text-foreground font-medium'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>اختصار بالجملة</span>
          </button>
        </div>
      )}

      {activeTab === 'single' ? (
        <SingleUrlShortener key={`single-${tabKey}`} token={token} onLinkCreated={onLinkCreated} />
      ) : (
        <BulkUrlShortener key={`bulk-${tabKey}`} token={token} onLinkCreated={onLinkCreated} />
      )}
    </div>
  );
}
