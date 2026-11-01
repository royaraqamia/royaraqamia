import { describe, expect, it } from 'vitest';

import {
  markdownToPlainText,
  noteName,
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

  it('drops a pasted tag in one pass and keeps a bare comparison', () => {
    expect(markdownToPlainText('<b>عريض</b> و 1 < 2 > 0')).toBe('عريض و 1 < 2 > 0');
    expect(markdownToPlainText('<scr<script>ipt>alert(1)</script>')).toBe('ipt>alert(1)');
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
  it('matches a query anywhere in the body', () => {
    const note = { body: '**حليب** وخبز' };
    expect(noteSearchText(note)).toContain(normalizeForSearch('حليب'));
  });
});

describe('noteName', () => {
  it('is the first line that says something, without its Markdown', () => {
    expect(noteName('\n## قائمة الشِّراء\n\nحليب وخبز')).toBe('قائمة الشِّراء');
  });

  it('is empty when the note holds no text', () => {
    expect(noteName('   \n\n  ')).toBe('');
  });

  it('truncates a long first line', () => {
    expect(noteName('كلمة أخرى', 4)).toBe('كلمة…');
  });
});

describe('notePreview', () => {
  it('is the text under the name, truncated', () => {
    expect(notePreview('قائمة\n\n**نصّ** طويل', 3)).toBe('نصّ…');
    expect(notePreview('سطر\nقصير')).toBe('قصير');
  });

  it('is empty when the name is the whole note', () => {
    expect(notePreview('قصير')).toBe('');
  });
});
