'use client';

import { AdminValidator } from '@/domains/linksnap/domain/services/admin-validator';

interface ViewSelectorProps {
  selectedView: 'shorten' | 'dashboard' | 'admin';
  userEmail: string | null;
  onChange: (view: 'shorten' | 'dashboard' | 'admin') => void;
}

export function ViewSelector({ selectedView, userEmail, onChange }: ViewSelectorProps) {
  const isAdmin = userEmail ? AdminValidator.isAdmin(userEmail) : false;

  return (
    <div className="bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between gap-1 w-full max-w-[360px] mx-auto">
      <ViewButton
        label="اختصار"
        active={selectedView === 'shorten'}
        onClick={() => onChange('shorten')}
      />
      <ViewButton
        label="لوحة التحكم"
        active={selectedView === 'dashboard'}
        onClick={() => onChange('dashboard')}
      />
      {isAdmin && (
        <ViewButton
          label="الإدارة"
          active={selectedView === 'admin'}
          onClick={() => onChange('admin')}
        />
      )}
    </div>
  );
}

function ViewButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer press-scale focus-ring ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
      }`}
    >
      {label}
    </button>
  );
}
