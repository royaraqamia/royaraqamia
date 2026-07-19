'use client';

import { useRef, useState, useCallback } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
}

export function OtpInput({ length = 6, value, onChange, onComplete, disabled }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      if (!/^\d*$/.test(digit)) return;

      const newValue = value.split('');
      newValue[index] = digit;
      const result = newValue.join('').slice(0, length);
      onChange(result);

      if (result.length === length) {
        onComplete?.(result);
      }

      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [value, length, onChange, onComplete]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !value[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [value]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      onChange(pasted);
      inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
    },
    [length, onChange]
  );

  return (
    <div className="flex gap-2 justify-center" dir="ltr">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={() => setFocusedIndex(i)}
          disabled={disabled}
          className="w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-white/5 text-foreground transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-50"
          style={{
            borderColor: focusedIndex === i ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          }}
        />
      ))}
    </div>
  );
}
