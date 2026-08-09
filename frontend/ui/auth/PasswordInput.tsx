'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/frontend/ui/primitives/input';

interface PasswordInputProps {
  id: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  error?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function PasswordInput({
  id,
  name,
  placeholder = '••••••••',
  autoComplete = 'current-password',
  error,
  disabled,
  'aria-describedby': ariaDescribedby,
  onChange,
  className,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="group relative flex w-full items-center">
      <Input
        id={id}
        name={name}
        type={showPassword ? 'text' : 'password'}
        required
        autoComplete={autoComplete}
        error={error}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={ariaDescribedby}
        onChange={(e) => onChange?.(e.target.value)}
        className={`pl-11 transition-all duration-200 ease-out placeholder:text-muted-foreground/50 ${className ?? ''}`.trim()}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowPassword((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowPassword((prev) => !prev);
          }
        }}
        className="absolute left-2.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground/70 transition-all duration-200 ease-out hover:bg-neutral-100 hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        tabIndex={disabled ? -1 : 0}
        aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        aria-pressed={showPassword}
        aria-controls={id}
      >
        {showPassword ? (
          <EyeOff size={18} className="transition-transform duration-200 ease-out" />
        ) : (
          <Eye size={18} className="transition-transform duration-200 ease-out" />
        )}
      </button>
    </div>
  );
}
