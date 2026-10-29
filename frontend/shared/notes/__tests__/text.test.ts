import { describe, expect, it } from 'vitest';

import {
  markdownToPlainText,
  notePreview,
  noteSearchText,
  normalizeForSearch,
} from '@/frontend/shared/notes/text';

describe('markdownToPlainText', () => {
  it('keeps prose and drops the formatting markers', () => {
    const text = markdownToPlainText(
      '# عنوان\n\n**عريض** و*مائل* و[رابط](https://example.com)\n\n- أول\n- ثاني'
    );
    expect(text).toBe('عنوان عريض ومائل ورابط أول ثاني');
  });

  it('keeps a fenced code block’s contents', () => {
    expect(markdownToPlainText('```ts\nconst a = 1;\n```')).toBe('const a = 1;');
  });
});

describe('normalizeForSearch', () => {
  it('folds Arabic diacritics and the alef/ya variants', () => {
    expect(normalizeForSearch('الصَّلاة')).toBe('الصلاه');
    expect(normalizeForSearch('أحمد')).toBe('احمد');
    expect(normalizeForSearch('على')).toBe('علي');
    expect(normalizeForSearch('مسؤول')).toBe('مسوول');
  });

  it('lowercases Latin text', () => {
    expect(normalizeForSearch('Note')).toBe('note');
  });
});

describe('noteSearchText', () => {
  it('matches a query in the title or in the body', () => {
    const note = { title: 'قائمة الشِّراء', body: '**حليب** وخبز' };
    expect(noteSearchText(note)).toContain(normalizeForSearch('قائمة'));
    expect(noteSearchText(note)).toContain(normalizeForSearch('حليب'));
  });
});

describe('notePreview', () => {
  it('truncates the plain text and adds an ellipsis', () => {
    expect(notePreview('**نصّ** طويل', 3)).toBe('نصّ…');
    expect(notePreview('قصير')).toBe('قصير');
  });
});
