import type { LucideIcon } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';

interface AdminPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Primary action (e.g. a "new" button). Stretches full-width below the title on small screens. */
  action?: React.ReactNode;
  /** Optional content rendered under the title row (e.g. a section nav). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Shared header for every Admin Console section. Keeps the icon/title/description
 * rhythm identical across pages and handles the desktop-to-mobile reflow in one
 * place: the icon scales down, the title truncates, and an action button moves
 * onto its own full-width row on phones.
 */
export function AdminPageHeader({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: AdminPageHeaderProps) {
  return (
    <header className={cn('mb-6 sm:mb-8', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-4 sm:gap-x-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/10 shadow-sm ring-1 ring-primary/10 sm:size-12">
          <Icon className="text-primary size-5 sm:size-6" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-foreground truncate text-xl font-bold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed text-pretty sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
      </div>

      {children}
    </header>
  );
}
