import { cn } from '@/frontend/shared/cn';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';

interface AdminPageHeaderProps {
  title: string;
  /** Primary action (e.g. a "new" button). Centred below the title. */
  action?: React.ReactNode;
  /** Optional content rendered under the title row (e.g. a section nav). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Shared header for every Admin Console section: one centred title, and the
 * section's action and nav beneath it. No icon and no subtitle — the section is
 * named by its title alone, so every page in the console opens the same way.
 */
export function AdminPageHeader({ title, action, children, className }: AdminPageHeaderProps) {
  return (
    <header className={cn('mb-6 text-center sm:mb-8', className)}>
      <SectionTitle as="h1">
        <SectionTitleHighlight>{title}</SectionTitleHighlight>
      </SectionTitle>

      {action && <div className="mt-4 flex justify-center">{action}</div>}

      {children}
    </header>
  );
}
