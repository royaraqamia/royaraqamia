// Premium Empty State Component -->
import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.ComponentProps<'div'> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

function EmptyState({ className, title, description, action, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-20 px-6 text-center',
        'bg-card/50 backdrop-blur-sm rounded-2xl border border-border/30',
        'shadow-sm hover:shadow-lg transition-all duration-300',
        'min-h-[400px]',
        className
      )}
      {...props}
    >
      <div className="relative mb-8">
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-muted/40 to-muted/20 flex items-center justify-center">
          <svg
            className="w-14 h-14 text-muted-foreground/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
            />
          </svg>
        </div>
        <div className="absolute -inset-2 bg-gradient-to-r from-transparent via-primary/10 to-transparent rounded-full blur-md" />
      </div>

      <h3 className="text-2xl font-semibold text-foreground mb-3">{title || 'لا توجد بيانات'}</h3>
      <p className="text-muted-foreground max-w-md mb-10 leading-relaxed text-base">
        {description ||
          'عذرًا، لا يوجد محتوى متاح في هذه اللحظة. يرجى التحقق لاحقًا أو تصفح الأقسام الأخرى.'}
      </p>

      {action && <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">{action}</div>}
    </div>
  );
}

export { EmptyState };
