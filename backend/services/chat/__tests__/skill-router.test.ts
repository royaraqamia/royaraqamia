import { describe, expect, it } from 'vitest';

import { routeSkills, routeSkillsLexically } from '@/backend/services/chat/skill-router';
import {
  SKILL_BLOCK_CHARS_MAX,
  SKILL_CANDIDATES,
  skillBlock,
  type SkillHit,
} from '@/backend/shared/domain/agent-skills';

/**
 * The router's own behaviour, apart from the fixture measurement (#1448).
 *
 * These are the promises the turn relies on: a word in the member's own
 * language finds its domain, a question that needs nothing carries nothing, and
 * the block stays a suggestion that names ids rather than a body.
 */

describe('the specialist router', () => {
  it('folds the spellings Arabic writes one word with', () => {
    expect(routeSkillsLexically('المصاريف الشهرية')).toEqual(routeSkillsLexically('مصاريف شهرية'));
  });

  it('finds a division the member describes, without an English word', () => {
    const hits = routeSkillsLexically('بدي أعمل هوية بصرية وشعار جديد');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.id).toContain('design');
  });

  it('reads a contract question as a document review', () => {
    const hits = routeSkillsLexically('راجع عقد الخدمة قبل ما أوقّع');
    expect(hits.some((hit) => hit.id === 'legal-document-review')).toBe(true);
  });

  it('answers nothing for a greeting', () => {
    expect(routeSkills('مرحبا، كيفك؟')).toEqual([]);
  });

  it('answers nothing for an empty question, whatever vector it is given', () => {
    expect(routeSkills('   ', { vector: new Array(1024).fill(0) })).toEqual([]);
  });

  it('ignores a vector of the wrong width and ranks by words instead', () => {
    const hits = routeSkills('راجع عقد الخدمة قبل ما أوقّع', { vector: [0.1, 0.2, 0.3] });
    expect(hits.some((hit) => hit.id === 'legal-document-review')).toBe(true);
  });

  it('never offers more than five, and orders them best first', () => {
    const hits = routeSkillsLexically('مشروع تصميم موقع وتسويق ومحتوى وبيانات وأمان');
    expect(hits.length).toBeLessThanOrEqual(SKILL_CANDIDATES);
    const scores = hits.map((hit) => hit.score);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });
});

describe('the shortlist block', () => {
  const hits: SkillHit[] = [
    {
      id: 'design-brand-guardian',
      name: 'Brand Guardian',
      description:
        'Expert brand strategist and guardian specializing in brand identity development',
      score: 0.81,
    },
  ];

  it('carries the id the model must copy, and says the list is a suggestion', () => {
    const block = skillBlock(hits);
    expect(block).toContain('design-brand-guardian');
    expect(block).toContain('load_specialist');
    expect(block).toContain('ليست تعليمات');
  });

  it('injects nothing when nothing cleared the floor', () => {
    expect(skillBlock([])).toBe('');
  });

  it('stays inside its ceiling even with an absurd description', () => {
    const block = skillBlock([{ ...hits[0]!, description: 'word '.repeat(500) }]);
    expect(block.length).toBeLessThanOrEqual(SKILL_BLOCK_CHARS_MAX);
  });
});
