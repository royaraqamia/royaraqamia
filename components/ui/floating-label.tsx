import * as React from 'react';
import { cn } from '@/lib/utils';

interface FloatingLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  label: string;
  error?: boolean;
  required?: boolean;
}

const FloatingLabel = React.forwardRef<HTMLDivElement, FloatingLabelProps>(
  ({ className, children, label, error, required, ...props }, ref) => {
    const [, setIsFocused] = React.useState(false);
    const [, setHasValue] = React.useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
      setIsFocused(true);
      (props as any).onFocus?.(e as any);
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      setIsFocused(false);
      (props as any).onBlur?.(e as any);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setHasValue(e.target.value.length > 0);
      (props as any).onChange?.(e as any);
    };

    const clonedChildren = React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement, {
          ...(children.props as any),
          onFocus: handleFocus,
          onBlur: handleBlur,
          onChange: handleInputChange,
          className: cn('peer', (children.props as any).className),
        })
      : children;

    return (
      <div
        ref={ref}
        className={cn('relative', className)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      >
        {clonedChildren}
        <label
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            'pointer-events-none select-none',
            'bg-background px-1',
            'peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary',
            'peer-focus:font-medium',
            'peer-not-placeholder-shown:-top-2.5 peer-not-placeholder-shown:text-xs',
            'peer-not-placeholder-shown:font-medium',
            'peer-disabled:opacity-50',
            error ? 'text-destructive peer-focus:text-destructive' : 'text-muted-foreground'
          )}
        >
          {label}
          {required && <span className="text-destructive mr-1">*</span>}
        </label>
      </div>
    );
  }
);

FloatingLabel.displayName = 'FloatingLabel';

export { FloatingLabel };
