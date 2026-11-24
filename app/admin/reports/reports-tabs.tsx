'use client';

import { useState } from 'react';

import { ChatReportsView } from '@/frontend/ui/admin/chat-reports/chat-reports-view';
import { CommentReportsView } from '@/frontend/ui/admin/comment-reports/comment-reports-view';

const TABS = [
  { id: 'chats', label: 'إبلاغات المحادثات' },
  { id: 'comments', label: 'إبلاغات التعليقات' },
] as const;

type Tab = (typeof TABS)[number]['id'];

export function ReportsTabs() {
  const [tab, setTab] = useState<Tab>('chats');

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="أنواع الإبلاغات" className="flex gap-2">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className="inline-flex min-h-9 items-center rounded-full border border-border/60 bg-card px-4 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            {option.label}
          </button>
        ))}
      </div>
      {tab === 'chats' ? <ChatReportsView /> : <CommentReportsView />}
    </div>
  );
}
