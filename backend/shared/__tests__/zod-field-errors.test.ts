import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';

function issuesOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected the schema to reject the input');
  return zodFieldErrors(result.error);
}

describe('zodFieldErrors', () => {
  it('maps an issue to its field', () => {
    const schema = z.object({ name: z.string().min(2, 'الاسم قصير') });

    expect(issuesOf(schema, { name: '' })).toEqual({ name: 'الاسم قصير' });
  });

  it('keeps the first issue when one field fails more than once', () => {
    const schema = z.object({ name: z.string().min(5, 'first').max(2, 'second') });

    expect(issuesOf(schema, { name: 'abc' })).toEqual({ name: 'first' });
  });

  it('joins a nested path with dots', () => {
    const schema = z.object({ a: z.object({ b: z.string().min(5, 'deep') }) });

    expect(issuesOf(schema, { a: { b: '' } })).toEqual({ 'a.b': 'deep' });
  });

  it('files a root-level issue under "form"', () => {
    const schema = z.object({ name: z.string() }).refine(() => false, 'root problem');

    expect(issuesOf(schema, { name: 'ok' })).toEqual({ form: 'root problem' });
  });
});
