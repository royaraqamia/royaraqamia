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
    <div className="w-full bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl shadow-slate-100/50 dark:shadow-slate-900/50">
      {token && (
        <div
          className="flex bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-1 rounded-xl mb-6"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'single'}
            onClick={() => switchTab('single')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer press-scale focus-ring ${
              activeTab === 'single'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-600/50 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium'
            }`}
          >
            <Link className="w-3.5 h-3.5 text-indigo-500" />
            <span>رابط واحد</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bulk'}
            onClick={() => switchTab('bulk')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer press-scale focus-ring ${
              activeTab === 'bulk'
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-600/50 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
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
