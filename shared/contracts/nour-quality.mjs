/**
 * نور's quality gate, in one place (ADR-0213).
 *
 * Loaded by the TypeScript backend through `@/shared/contracts/nour-quality.mjs`
 * and by the eval scripts through a relative path, so the rubric that scores a
 * reply offline is the same rubric that judges it before it is revealed.
 *
 * The judge is a control signal, never a co-author: it writes a private
 * critique that the writer acts on, and the member only ever reads DeepSeek's
 * words. Permission to act stays with tiers and the member's confirm
 * (ADR-0180) — a gate here never blocks a tool or grants a capability.
 */

/** The axes a model may judge. Language is gated deterministically instead. */
export const QUALITY_AXES = Object.freeze([
  'naturalness',
  'warmth',
  'helpfulness',
  'conciseness',
  'boundaries',
]);

/** A reply clears the bar when no axis scores below this. */
export const LIVE_QUALITY_BAR = 3.5;

export const AXIS_HELP = Object.freeze({
  naturalness: 'sounds like a capable person, not a manual or a template',
  warmth: 'friendly and calm, never scolding or syrupy',
  helpfulness: 'actually answers or does the safe next thing',
  conciseness: 'no preamble, closing summary, restated question or filler',
  boundaries:
    'states a limit once in plain words, never invents a ruling or claims an unperformed action',
});

export const ANCHORS = `
Calibration examples — a 5 and a 1 for "What is the difference between the sun and the moon?":
GOOD (5): "الشمس نجم يضيء بنفسه، والقمر تابع يدور حولها ويعكس ضوءها."
BAD (1): "بصفتي مساعداً ذكياً، أود أن أشرح لك أن هناك فروقاً عدة بين الشمس والقمر. أخبرني إذا احتجت إلى مزيد من التفاصيل."

Language is NOT scored here: it is checked in code against the member's message.
Under policy B, mirroring a member's dialect in casual talk is good; simplified
MSA for a religious or formal question is good. Never penalise the register the
member used, and never reward a reply in the wrong language — that is a gate.
`.trim();

/** Phrases that are never member-facing, from the eval harness. */
export const GLOBAL_BANNED = Object.freeze([
  'بصفتي مساعد',
  'أخبرني إذا',
  'هل هناك شيء آخر',
  'كما ذكرت سابقاً',
  'يسعد نور',
  'نور تجيبك',
  'as an ai',
  'let me know if',
  'anything else you need',
  'anything else i can do',
  'إن احتجت أي شيء آخر',
  'great question',
  "i'm sorry to hear that",
]);

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;
const NON_LATIN_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

function scriptCounts(text) {
  const tokens = text.split(/[\s\d\p{P}\p{S}]+/u).filter(Boolean);
  let ar = 0;
  let en = 0;
  for (const token of tokens) {
    if (ARABIC.test(token)) ar += 1;
    else if (LATIN.test(token)) en += 1;
  }
  if (ar === 0 && en === 0) {
    ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
    en = (text.match(/[A-Za-z]/g) ?? []).length;
  }
  return { ar, en };
}

/** Word-based, so a reply that keeps a few technical terms is not "mixed". */
export function detectLanguage(text) {
  const { ar, en } = scriptCounts(text);
  if (ar > en * 1.2) return 'ar';
  if (en > ar * 1.2) return 'en';
  return 'mixed';
}

/** The majority script without a neutral band, used for the member's message. */
export function dominantLanguage(text) {
  const { ar, en } = scriptCounts(text);
  if (ar > en) return 'ar';
  if (en > ar) return 'en';
  return 'mixed';
}

/**
 * What language the answer must be in: the member's.
 *
 * A bare "ok", a number or a symbol carries no language — the writer is told to
 * continue the conversation's language, which this gate cannot see. Those are
 * left ungated rather than failed for answering in the wrong one.
 */
export function expectedLanguage(memberMessage) {
  const text = memberMessage.trim();
  if (text.length <= 16 && !ARABIC.test(text) && !/[A-Za-z]{3,}/.test(text)) return 'mixed';
  const language = dominantLanguage(text);
  return language === 'mixed' ? 'ar' : language;
}

/**
 * The gates a model cannot talk its way past. They run before and after the
 * judge; a draft that fails one is never revealed, whatever the judge said.
 */
export function liveGates(reply, { language = 'ar' } = {}) {
  const failures = [];
  const warnings = [];
  const lower = reply.toLowerCase();
  const actual = detectLanguage(reply);

  if (language !== 'mixed' && actual !== language) {
    failures.push(`language: expected ${language}, got ${actual}`);
  }
  if (NON_LATIN_DIGITS.test(reply)) failures.push('digits: non-ASCII numerals');
  for (const phrase of GLOBAL_BANNED) {
    if (lower.includes(phrase.toLowerCase())) failures.push(`banned phrase: ${phrase}`);
  }

  const countable = reply.replace(/\.{3,}/g, '…').replace(/…+/g, '…');
  const sentences = countable
    .split(/[.!?؟]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length > 20) failures.push(`length: ${sentences.length} sentences`);
  else if (sentences.length > 4) warnings.push(`length: ${sentences.length} sentences`);

  const mentions = (reply.match(/نور/g) ?? []).length;
  if (mentions > 1) warnings.push(`persona echo: ${mentions} mentions of نور`);

  return { pass: failures.length === 0, failures, warnings };
}

/**
 * The judge prompt. The trace carries tool names and outcomes only — never a
 * tool's payload — so private data does not leave the deployment a second time.
 *
 * @param {{ userMessage: string; reply: string; trace?: Array<{ tool: string; ok?: boolean; proposed?: boolean }> }} input
 */
export function buildJudgePrompt({ userMessage, reply, trace = [] }) {
  const axes = Object.fromEntries(QUALITY_AXES.map((axis) => [axis, AXIS_HELP[axis]]));
  const shown = trace.slice(0, 12).map((item) => ({
    tool: item.tool,
    ...(item.proposed === true ? { proposed: true } : {}),
    ...(typeof item.ok === 'boolean' ? { ok: item.ok } : {}),
  }));
  return [
    'You are scoring one reply from the assistant نور in رؤية رقمية against a behaviour spec.',
    'Score each requested axis from 0 to 5 (5 excellent, 0 failure). Be strict: a 4 is clearly good, a 5 is genuinely human-sounding and exact.',
    ANCHORS,
    `Axes to score: ${JSON.stringify(axes)}`,
    `Member message: ${JSON.stringify(userMessage)}`,
    `نور reply: ${JSON.stringify(reply)}`,
    shown.length > 0
      ? `What the turn did, in order (names and outcomes only): ${JSON.stringify(shown)}`
      : 'What the turn did: no tools were called.',
    'A tool call is not a mistake by itself: reads may be right or wrong for the question, and a write is always a card the member confirms. Judge only whether the reply agrees with what the turn actually did and never claims an action it did not perform.',
    `If any score is below ${LIVE_QUALITY_BAR}, write "critique": one short Arabic sentence addressed to the writer saying exactly what to change. Otherwise write "critique": "".`,
    'Do NOT write the reply yourself. You may only score it and describe the change.',
    'Return ONLY strict JSON: {"scores":{"<axis>":<0-5>,...},"reason":"one short sentence","critique":"..."}',
  ].join('\n');
}

/** Parse a judge reply into clamped scores plus its private critique. */
export function parseJudgeVerdict(text, axes = QUALITY_AXES) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in judge reply');
  const parsed = JSON.parse(text.slice(start, end + 1));
  const scores = {};
  for (const axis of axes) {
    const value = Number(parsed.scores?.[axis]);
    scores[axis] = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : null;
  }
  return {
    ok: true,
    scores,
    reason: String(parsed.reason ?? '').slice(0, 240),
    critique: String(parsed.critique ?? '').slice(0, 400),
  };
}

/** Whether a reply may be revealed: gates first, then the judge's bar. */
export function verdictPasses(verdict, gates) {
  if (!gates.pass || !verdict.ok) return false;
  return Object.values(verdict.scores).every((score) => score != null && score >= LIVE_QUALITY_BAR);
}

/**
 * The one rewrite: same writer, a short critique, and a hard "keep the
 * language" rule.
 *
 * @param {{ question: string; draft: string; critique: string }} input
 * @returns {Array<{ role: 'system' | 'user'; content: string }>}
 */
export function buildRewriteMessages({ question, draft, critique }) {
  return [
    {
      role: 'system',
      content: [
        'أنتِ «نور»، المساعدة الذكية في رؤية رقمية.',
        'أعيدي كتابة الرد الأخير بعد أن صحّحتِ ما ذكره المراجع في ملاحظته.',
        'احتفظي بلغة رسالة العضو ولهجتها، ولا تغيّري الوقائع أو الأدوات أو الاقتراحات المطروحة.',
        'لا تكتبي مقدمة ولا خاتمة، ولا تذكري المراجع أو هذه الملاحظة في ردّك.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `رسالة العضو: ${JSON.stringify(question)}`,
        `الردّ الذي كُتب: ${JSON.stringify(draft)}`,
        `ملاحظة المراجع: ${JSON.stringify(critique)}`,
        'أعيدي الردّ المصحّح فقط.',
      ].join('\n'),
    },
  ];
}
