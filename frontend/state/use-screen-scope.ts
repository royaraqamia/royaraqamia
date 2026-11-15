'use client';

import { useEffect, useRef } from 'react';

import { registerScreenScope, type ScreenScope } from './screen-scopes';

/** Everything that makes one registration different from the last. */
function scopeKey(scope: ScreenScope): string {
  const fields = (scope.fields ?? [])
    .map((field) => `${field.name}:${field.type ?? ''}:${field.autocomplete ?? ''}:${field.value}`)
    .join('|');
  return [
    scope.id,
    scope.kind,
    scope.focus?.kind ?? '',
    scope.focus?.id ?? '',
    scope.tab ?? '',
    fields,
    scope.text ?? '',
  ].join('\u0000');
}

/**
 * Publish a sheet, a dialog or a page to the assistant while it is on screen
 * (ADR-0181, decision 2).
 *
 * A surface calls it with what it has in hand and passes `null` when it has
 * nothing to show; the registration is removed on unmount, so a closed sheet
 * cannot stay in the snapshot. The value is re-registered when anything in it
 * changes — a field's value, the record in hand — but the publisher settles the
 * snapshot rather than sending each keystroke (decision 3).
 *
 * The fields handed over here are candidates, never what the model sees: the
 * surface's allowlist and the structural denylist are applied inside the store
 * (`readableFields`), so this hook cannot leak a password even if a form passes
 * one in (#1419).
 */
export function useScreenScope(scope: ScreenScope | null): void {
  const latest = useRef(scope);
  latest.current = scope;

  const key = scope ? scopeKey(scope) : '';

  useEffect(() => {
    const current = latest.current;
    if (!current) return;
    return registerScreenScope(current);
  }, [key]);
}
