'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  hasError,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

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
      if (pasted.length === length) {
        onComplete?.(pasted);
      }
    },
    [length, onChange, onComplete]
  );

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  return (
    <div className="flex gap-3 justify-center" dir="ltr">
      {Array.from({ length }, (_, i) => {
        const isFocused = focusedIndex === i;
        const isFilled = value[i] !== undefined && value[i] !== '';

        return (
          <motion.div
            key={i}
            animate={
              hasError && !isFocused
                ? {
                    x: [0, -4, 4, -4, 4, 0],
                    transition: { duration: 0.4, ease: 'easeInOut' },
                  }
                : {}
            }
          >
            <input
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
              onBlur={() => setFocusedIndex(null)}
              disabled={disabled}
              className="size-12 sm:size-14 text-center text-xl font-bold rounded-xl border-2 bg-muted text-foreground outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:opacity-50"
              style={{
                borderColor:
                  hasError && !isFocused
                    ? 'hsl(var(--destructive))'
                    : isFocused
                      ? 'hsl(var(--ring))'
                      : isFilled
                        ? 'hsl(var(--primary) / 0.5)'
                        : 'hsl(var(--border))',
                boxShadow: isFocused
                  ? '0 0 0 3px hsl(var(--ring) / 0.15), 0 4px 12px hsl(var(--ring) / 0.1)'
                  : hasError && !isFocused
                    ? '0 0 0 3px hsl(var(--destructive) / 0.1)'
                    : 'none',
              }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
