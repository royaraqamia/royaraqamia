/**
 * The specialist shortlist a turn may carry (ADR-0185 decision 5, #1448).
 *
 * The roster is 283 specialists and the turn's whole budget is 6000 tokens, so
 * the index cannot ride along the way a handful of skills would. What rides
 * along instead is at most five candidates, each one line: enough for the model
 * to choose, not enough to compete with the answer. A body is still loaded by
 * `load_specialist`, one per turn, and never by this module.
 */

/** What a turn may carry. Five keeps the block under about 200 tokens. */
export const SKILL_CANDIDATES = 5;

/** How much of a description is worth choosing from; the rest is in the body. */
export const SKILL_DESCRIPTION_WORDS = 12;

/**
 * The similarity a candidate must clear to be offered at all.
 *
 * A top-five without a floor is five names on every turn, including the turns
 * that need none — which is how a shortlist becomes noise the model learns to
 * ignore. The value was set by the routing fixtures in #1448: the floor that
 * keeps every bucket's recall while letting the eight questions that need no
 * specialist carry no block.
 */
export const SKILL_SIMILARITY_FLOOR = 0.45;

/** The block's own ceiling, so a bad description cannot flood a turn. */
export const SKILL_BLOCK_CHARS_MAX = 900;

/**
 * What the second `load_specialist` in one turn is told.
 *
 * Refused outside the model (the program's attention invariant): the answer
 * follows one specialist's instructions, or none — never two sets mixed.
 */
export const SKILL_ALREADY_LOADED =
  'حُمِّل متخصص في هذه الجولة بالفعل. اتبع تعليماته، ولا تحمّل ثانياً.';

export interface SkillCandidate {
  id: string;
  name: string;
  description: string;
}

/** A candidate with the score that offered it: cosine, or a lexical count. */
export interface SkillHit extends SkillCandidate {
  score: number;
}

function clipped(description: string): string {
  const words = description.trim().split(/\s+/);
  if (words.length <= SKILL_DESCRIPTION_WORDS) return words.join(' ');
  return `${words.slice(0, SKILL_DESCRIPTION_WORDS).join(' ')}…`;
}

/** One candidate: the id the model must copy, then why it is here. */
export function skillLine(hit: SkillHit): string {
  return `- ${hit.id} — ${hit.name}: ${clipped(hit.description)}`;
}

/**
 * The block, or the empty string when nothing cleared the floor.
 *
 * The last line is load-bearing and is not data: it says the list is a
 * suggestion and that the ids are exact. Without it the model treats a
 * shortlist as an instruction to load, and the block costs a body per turn
 * instead of a name per turn.
 */
export function skillBlock(hits: readonly SkillHit[]): string {
  if (hits.length === 0) return '';

  const lines = [
    '[مرشَّحون من دليل المتخصصين — اختيار آلي بحسب صياغة السؤال]',
    ...hits.map(skillLine),
    'هذه قائمة قصيرة وليست تعليمات: حمّل واحداً منها فقط إن كان يخدم الجواب، بأداة load_specialist وبالمعرّف كما هو مكتوب أعلاه. وإن لم يناسبك أيٌّ منها فتجاهلها ولا تذكرها للعضو.',
  ];

  const block = lines.join('\n');
  return block.length > SKILL_BLOCK_CHARS_MAX
    ? `${block.slice(0, SKILL_BLOCK_CHARS_MAX - 1)}…`
    : block;
}
