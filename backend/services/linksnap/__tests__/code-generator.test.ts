import { describe, it, expect } from 'vitest';
import { CodeGenerator } from '@/backend/services/linksnap/code-generator';

const ALLOWED_CHARS = /^[a-zA-Z0-9]+$/;

describe('CodeGenerator.generate', () => {
  it('generates a code of the default length 6', () => {
    const code = CodeGenerator.generate();
    expect(code).toHaveLength(6);
    expect(code).toMatch(ALLOWED_CHARS);
  });

  it('generates a code of a custom length', () => {
    expect(CodeGenerator.generate(10)).toHaveLength(10);
    expect(CodeGenerator.generate(1)).toHaveLength(1);
  });

  it('generates distinct values across many calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => CodeGenerator.generate()));
    expect(codes.size).toBeGreaterThan(90);
  });

  it('handles length zero', () => {
    expect(CodeGenerator.generate(0)).toBe('');
  });

  it('handles negative lengths gracefully', () => {
    expect(CodeGenerator.generate(-1)).toBe('');
  });
});

describe('CodeGenerator.sanitizeCustomCode', () => {
  it('keeps alphanumerics, dashes and underscores', () => {
    expect(CodeGenerator.sanitizeCustomCode('my-cool_code1')).toBe('my-cool_code1');
  });

  it('trims surrounding whitespace', () => {
    expect(CodeGenerator.sanitizeCustomCode('  mycode  ')).toBe('mycode');
  });

  it('strips disallowed characters', () => {
    expect(CodeGenerator.sanitizeCustomCode('my code!@#$')).toBe('mycode');
    expect(CodeGenerator.sanitizeCustomCode('ab/cd\\ef')).toBe('abcdef');
    expect(CodeGenerator.sanitizeCustomCode('عربي')).toBe('');
  });

  it('returns an empty string for all-disallowed input', () => {
    expect(CodeGenerator.sanitizeCustomCode('!!!')).toBe('');
    expect(CodeGenerator.sanitizeCustomCode('')).toBe('');
  });
});
