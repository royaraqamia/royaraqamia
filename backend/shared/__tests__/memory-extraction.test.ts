import { describe, expect, it } from 'vitest';

import {
  EXTRACTION_CONFIDENCE_FLOOR,
  EXTRACTION_MAX_FACTS,
  extractionPrompt,
  parseExtractedFacts,
  parseExtractionJson,
} from '@/backend/shared/domain/memory-extraction';

/**
 * What extraction is allowed to offer the write path (ADR-0182 decision 2,
 * decision 5, #1511). The parser is the rule, not the prompt: every assertion
 * here is a fact the member's `agent_memories` either accepts or never sees.
 */

const TARGET = { threadId: 'conversation-1', product: 'spendtrack' };
const QUESTION = 'تذكّر أنني أفضّل أن يبدأ التقرير بالملخص، وأن ميزانيتي تُصرف في الخامس عشر.';

function fact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
    kind: 'preference',
    scope: 'account',
    confidence: 0.9,
    ...overrides,
  };
}

describe('parseExtractedFacts', () => {
  it('keeps a fact above the floor and resolves the scope keys', () => {
    expect(
      parseExtractedFacts({ facts: [fact()] }, { target: TARGET, question: QUESTION })
    ).toEqual([
      {
        text: 'العضو يفضّل أن يبدأ التقرير بالملخص',
        kind: 'preference',
        scope: 'account',
        product: null,
        threadId: null,
        confidence: 0.9,
      },
    ]);
  });

  it('writes nothing below the floor, and does not store it hidden either', () => {
    const below = EXTRACTION_CONFIDENCE_FLOOR - 0.01;
    expect(
      parseExtractedFacts(
        { facts: [fact({ confidence: below })] },
        {
          target: TARGET,
          question: QUESTION,
        }
      )
    ).toEqual([]);
    expect(
      parseExtractedFacts(
        { facts: [fact({ confidence: EXTRACTION_CONFIDENCE_FLOOR })] },
        {
          target: TARGET,
          question: QUESTION,
        }
      )
    ).toHaveLength(1);
  });

  it('stops at three facts per turn', () => {
    const facts = Array.from({ length: EXTRACTION_MAX_FACTS + 1 }, (_, index) =>
      fact({ text: `الحقيقة رقم ${index + 1}` })
    );
    expect(parseExtractedFacts({ facts }, { target: TARGET, question: QUESTION })).toHaveLength(
      EXTRACTION_MAX_FACTS
    );
  });

  it('drops the whole fact when a field is outside the schema', () => {
    const facts = [
      fact({ text: '' }),
      fact({ text: 'ا'.repeat(501) }),
      fact({ kind: 'hobby' }),
      fact({ scope: 'global' }),
      fact({ confidence: 1.2 }),
      fact({ confidence: 'عالية' }),
      fact(),
    ];

    expect(parseExtractedFacts({ facts }, { target: TARGET, question: QUESTION })).toHaveLength(1);
  });

  it('resolves thread and product scopes, and drops a product fact without a product', () => {
    const facts = [fact({ scope: 'thread' }), fact({ scope: 'product' })];
    expect(parseExtractedFacts({ facts }, { target: TARGET, question: QUESTION })).toMatchObject([
      { scope: 'thread', threadId: 'conversation-1', product: null },
      { scope: 'product', product: 'spendtrack', threadId: null },
    ]);

    expect(
      parseExtractedFacts(
        { facts: [fact({ scope: 'product' })] },
        {
          target: { threadId: 'conversation-1', product: null },
          question: QUESTION,
        }
      )
    ).toEqual([]);
  });

  it('accepts a health fact only with the member sentence it was read from', () => {
    const asked = 'احفظ أن عندي حساسية من الغبار، لأني سأسألك عن الأعراض لاحقاً.';
    const health = fact({
      kind: 'health',
      text: 'العضو لديه حساسية من الغبار',
      evidence: 'عندي حساسية من الغبار',
    });

    expect(
      parseExtractedFacts({ facts: [health] }, { target: TARGET, question: asked })
    ).toHaveLength(1);
  });

  it('drops a sensitive fact whose evidence is invented or not in this turn', () => {
    const legal = fact({
      kind: 'legal',
      text: 'العضو لديه قضية قانونية',
      evidence: 'عندي قضية في المحكمة',
    });

    // Not in the member's message in this turn: the answer cannot authorise a
    // fact the member never asked to keep.
    expect(parseExtractedFacts({ facts: [legal] }, { target: TARGET, question: QUESTION })).toEqual(
      []
    );
    expect(
      parseExtractedFacts(
        { facts: [legal] },
        {
          target: TARGET,
          question: 'عندي قضية في المحكمة',
        }
      )
    ).toHaveLength(1);
  });

  it('matches the quoted sentence across spacing differences', () => {
    const question = 'احفظ  أن   عندي  حساسية من الغبار.';
    const health = fact({
      kind: 'health',
      text: 'العضو لديه حساسية من الغبار',
      evidence: 'عندي حساسية من الغبار',
    });
    expect(parseExtractedFacts({ facts: [health] }, { target: TARGET, question })).toHaveLength(1);
  });

  it('refuses credentials and card numbers before a row exists', () => {
    const facts = [
      fact({ text: 'كلمة المرور هي hunter2' }),
      // A Luhn-valid card number, which is what the door refuses.
      fact({ text: 'بطاقتي 4111 1111 1111 1111' }),
      fact({ text: 'العضو يفضّل البداية بالملخص' }),
    ];
    expect(parseExtractedFacts({ facts }, { target: TARGET, question: QUESTION })).toHaveLength(1);
  });

  it('reads nothing out of a shape it does not recognise', () => {
    expect(parseExtractedFacts(null, { target: TARGET, question: QUESTION })).toEqual([]);
    expect(
      parseExtractedFacts({ items: [fact()] }, { target: TARGET, question: QUESTION })
    ).toEqual([]);
    expect(parseExtractedFacts([fact()], { target: TARGET, question: QUESTION })).toHaveLength(1);
  });

  it('leaves an unknown extra field alone rather than repairing the fact', () => {
    const facts = [fact({ colour: 'blue' })];
    expect(parseExtractedFacts({ facts }, { target: TARGET, question: QUESTION })).toHaveLength(1);
  });
});

describe('parseExtractionJson', () => {
  it('reads plain JSON and a fenced answer', () => {
    expect(parseExtractionJson('{"facts":[]}')).toEqual({ facts: [] });
    expect(parseExtractionJson('```json\n{"facts":[]}\n```')).toEqual({ facts: [] });
  });

  it('answers null for anything a model might otherwise say', () => {
    expect(parseExtractionJson('لا شيء لأحفظه.')).toBeNull();
    expect(parseExtractionJson('')).toBeNull();
  });
});

describe('extractionPrompt', () => {
  it('bounds each side of the exchange and keeps them apart', () => {
    const prompt = extractionPrompt({ question: 'س'.repeat(5000), answer: 'ج'.repeat(5000) });
    expect(prompt.length).toBeLessThan(4100);
    expect(prompt).toContain('رسالة العضو:');
    expect(prompt).toContain('ردّ المساعدة:');
  });
});
