import { useState, useId } from 'react';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { WarningCircle, CheckCircle } from '@phosphor-icons/react';

interface FormFieldProps {
  id?: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
  validation?: (value: string) => string | null;
  ariaDescribedBy?: string;
  helpText?: string;
  maxLength?: number;
  showCount?: boolean;
  autoComplete?: string;
}

export function FormField({
  id: providedId,
  label,
  type = 'text',
  required = false,
  placeholder = '',
  rows,
  value,
  onChange,
  validation,
  ariaDescribedBy,
  helpText,
  maxLength,
  showCount = false,
  autoComplete,
}: FormFieldProps) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [isValid, setIsValid] = useState(false);

  const validateField = (newValue: string) => {
    if (validation) {
      const errorMessage = validation(newValue);
      setError(errorMessage);
      setIsValid(!errorMessage && newValue.trim().length > 0);
    } else if (required && !newValue.trim()) {
      setError('هذا الحقل مطلوب');
      setIsValid(false);
    } else {
      setError(null);
      setIsValid(newValue.trim().length > 0);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    validateField(value);
  };

  const handleChange = (newValue: string) => {
    onChange(newValue);
    if (touched) {
      validateField(newValue);
    }
  };

  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const hasError = touched && error;
  const showSuccess = touched && isValid && !error;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-medium leading-none text-foreground">
          {label}
          {required && (
            <span className="text-destructive mr-1" aria-label="مطلوب">
              *
            </span>
          )}
        </Label>
        {showSuccess && (
          <CheckCircle
            className="w-4 h-4 text-green-600 flex-shrink-0"
            weight="duotone"
            aria-label="صحيح"
          />
        )}
      </div>

      {helpText && (
        <p id={helpId} className="text-xs text-muted-foreground leading-relaxed">
          {helpText}
        </p>
      )}

      {rows ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          rows={rows}
          required={required}
          maxLength={maxLength}
          showCount={showCount}
          error={hasError}
          aria-invalid={hasError ? 'true' : 'false'}
          aria-describedby={
            [hasError ? errorId : null, helpText ? helpId : null, ariaDescribedBy]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          error={hasError}
          autoComplete={autoComplete}
          aria-invalid={hasError ? 'true' : 'false'}
          aria-describedby={
            [hasError ? errorId : null, helpText ? helpId : null, ariaDescribedBy]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
      )}

      {hasError && (
        <div
          id={errorId}
          className="flex items-start gap-2 text-destructive text-sm animate-in slide-in-from-top-1 duration-200 mt-1.5"
          role="alert"
          aria-live="polite"
        >
          <WarningCircle className="w-4 h-4 flex-shrink-0 mt-0.5" weight="duotone" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
    </div>
  );
}

// Enhanced validation helpers with better UX
export const validators = {
  email: (value: string) => {
    if (!value.trim()) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) ? null : 'يرجى إدخال بريد إلكتروني صحيح (مثال: user@example.com)';
  },

  phone: (value: string) => {
    if (!value.trim()) return null;
    const cleanPhone = value.replace(/\D/g, '');
    const phoneRegex = /^[\d+\s()-]+$/;
    if (!phoneRegex.test(value)) {
      return 'يرجى إدخال رقم هاتف صحيح';
    }
    if (cleanPhone.length < 9) {
      return 'رقم الهاتف قصير جداً (9 أرقام على الأقل)';
    }
    if (cleanPhone.length > 15) {
      return 'رقم الهاتف طويل جداً (15 رقم كحد أقصى)';
    }
    return null;
  },

  minLength: (min: number) => (value: string) => {
    if (!value.trim()) return null;
    return value.length >= min ? null : `يجب أن يحتوي على ${min} حرفًا على الأقل`;
  },

  maxLength: (max: number) => (value: string) => {
    if (!value.trim()) return null;
    return value.length <= max ? null : `يجب ألا يتجاوز ${max} حرفًا`;
  },

  url: (value: string) => {
    if (!value.trim()) return null;
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return 'يجب أن يبدأ الرابط بـ http:// أو https://';
      }
      return null;
    } catch {
      return 'يرجى إدخال رابط صحيح (مثال: https://example.com)';
    }
  },

  required: (value: string) => {
    return value.trim().length > 0 ? null : 'هذا الحقل مطلوب';
  },

  arabicName: (value: string) => {
    if (!value.trim()) return null;
    const arabicRegex = /^[\u0600-\u06FF\s]+$/;
    return arabicRegex.test(value) ? null : 'يرجى إدخال الاسم بالعربية فقط';
  },

  noSpecialChars: (value: string) => {
    if (!value.trim()) return null;
    const specialCharsRegex = /[<>"'&]/;
    return !specialCharsRegex.test(value) ? null : 'لا يُسمح بالرموز الخاصة';
  },

  // XSS protection - blocks script tags and event handlers
  noScriptTags: (value: string) => {
    if (!value.trim()) return null;
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i, // onclick=, onerror=, etc.
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /data:\s*text\/html/i,
    ];
    const hasXss = xssPatterns.some((pattern) => pattern.test(value));
    return hasXss ? 'يحتوي النص على محتوى غير مسموح به' : null;
  },
};

// Sanitize input - removes potentially dangerous content
export const sanitizeInput = (value: string): string => {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/[<>"'&]/g, (char) => {
      // HTML entity encoding
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;',
      };
      return entities[char] || char;
    })
    .substring(0, 2000); // Limit length
};

// Compose multiple validators
export const composeValidators = (...validators: Array<(value: string) => string | null>) => {
  return (value: string) => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) return error;
    }
    return null;
  };
};
