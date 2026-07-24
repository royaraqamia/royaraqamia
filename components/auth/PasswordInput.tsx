'use client';

import { useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';

interface PasswordInputProps {
  id: string;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  error?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  onChange?: (value: string) => void;
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
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
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
        className="pl-11"
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:text-foreground"
        tabIndex={-1}
        aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      >
        {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
