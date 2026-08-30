'use client';

interface ViewSelectorProps {
  selectedView: 'shorten' | 'dashboard' | 'admin';
  isAdmin: boolean;
  onChange: (view: 'shorten' | 'dashboard' | 'admin') => void;
}

export function ViewSelector({ selectedView, isAdmin, onChange }: ViewSelectorProps) {
  return (
    <div
      className="bg-card p-1 rounded-xl border border-border shadow-sm flex items-center justify-between gap-1 w-full max-w-90 mx-auto"
      role="tablist"
      aria-label="التنقل بين العروض"
    >
      <ViewButton
        label="اختصار"
        active={selectedView === 'shorten'}
        onClick={() => onChange('shorten')}
        id="tab-shorten"
      />
      <ViewButton
        label="لوحة التحكم"
        active={selectedView === 'dashboard'}
        onClick={() => onChange('dashboard')}
        id="tab-dashboard"
      />
      {isAdmin && (
        <ViewButton
          label="الإدارة"
          active={selectedView === 'admin'}
          onClick={() => onChange('admin')}
          id="tab-admin"
        />
      )}
    </div>
  );
}

function ViewButton({
  label,
  active,
  onClick,
  id,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  id: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${id.replace('tab-', '')}`}
      id={id}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`flex-1 py-2.5 px-3 rounded-full text-xs font-bold text-center transition-all cursor-pointer press-scale focus-ring touch-target btn-press ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-primary'
      }`}
    >
      {label}
    </button>
  );
}
