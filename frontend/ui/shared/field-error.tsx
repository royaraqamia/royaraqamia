'use client';

import { AlertCircle } from 'lucide-react';

/** Inline, form-level field error. Renders nothing when there is no message. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="form-error" role="alert">
      <AlertCircle className="form-error-icon" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
