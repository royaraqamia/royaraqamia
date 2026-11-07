/**
 * The rules every agent door speaks by, in one place.
 *
 * Three surfaces answer on the owner's behalf: the terminal session, the
 * Telegram bot (`scripts/telegram/prompt.mjs`) and the product's assistant
 * (`backend/services/chat/chat-agent-service.ts`). They have different
 * audiences and different jobs, so the *length* differs per door and the
 * *voice* does not. When one of them said "بإيجاز" and the others did not, the
 * same request came back three ways depending on where it was asked.
 *
 * This module is the seam: the rules are data, the door picks a language and a
 * sentence cap, and `npm run check:agent-behaviour` fails a pull request whose
 * prompt stopped carrying the lines. Plain `.mjs` on purpose — the Telegram
 * prompt is a script Node runs without a build step, and this repo's scripts do
 * not import from `backend/` or `shared/`; a `.mjs` is the one file both the
 * build and the script can load.
 */

/**
 * How many sentences a plain answer may run on each door.
 *
 * The terminal and the bot answer one person who wants the answer. The product
 * assistant answers a member who may need one sentence of explanation, so it
 * gets the same cap as the bot rather than the tighter terminal one.
 */
export const SENTENCE_CAP = Object.freeze({
  terminal: 3,
  telegram: 4,
  assistant: 4,
});

/**
 * One line per rule, in the register each door reads. `id` is what the check
 * reports, so a missing rule names itself rather than dumping the prompt.
 */
export const RULES = Object.freeze([
  {
    id: 'answer-first',
    en: 'Answer first: the first sentence is the answer, not a preamble.',
    ar: 'ابدأ بالجواب: الجملة الأولى هي الجواب، لا مقدمة قبلها.',
  },
  {
    id: 'no-tail',
    en: 'No closing summary, no restating the question, no "let me know if…"; stop when the answer ends.',
    ar: 'لا خاتمة ولا إعادة للسؤال ولا «أخبرني إن أردت…»؛ توقّف عند نهاية الجواب.',
  },
  {
    id: 'lists',
    en: 'Bullets only for things that are really a list, never to split a paragraph.',
    ar: 'القوائم للنقاط التي هي قائمة فعلاً، لا لتقسيم كلام متصل.',
  },
  {
    id: 'detail-on-request',
    en: 'Expand only when the user asks to explain or walk through it.',
    ar: 'التفصيل فقط إذا طلب المستخدم الشرح أو الخطوات.',
  },
  {
    id: 'no-silent-assumption',
    en: 'Never assume silently: name the assumption in one clause, or ask first.',
    ar: 'لا تفترض شيئاً في صمت: اذكر افتراضك في شطر واحد، أو اسأل أولاً.',
  },
  {
    id: 'ask-before-expensive',
    en: 'Ask instead of acting when a wrong guess is expensive: git writes, deploy, delete, publish, spend, user-facing copy, schema.',
    ar: 'اسأل بدل أن تتحرك إذا كان الخطأ مكلفاً: كتابة git، النشر، الحذف، نشر المحتوى، الصرف، نصوص الواجهة، المخطط.',
  },
]);

/** The language each door's prompt is written in. */
const PROMPT_LANGUAGE = Object.freeze({
  terminal: 'en',
  telegram: 'ar',
  assistant: 'ar',
});

/**
 * The rule lines for one door, ending with its own length cap.
 *
 * `language` overrides the door's default, for a surface that has to mirror the
 * language of the message it answers.
 */
export function behaviourLines({ surface, language = PROMPT_LANGUAGE[surface] }) {
  const cap = SENTENCE_CAP[surface];
  if (!cap) throw new Error(`unknown agent surface: ${String(surface)}`);
  const key = language === 'en' ? 'en' : 'ar';
  return [
    ...RULES.map((rule) => rule[key]),
    key === 'en'
      ? `Keep a plain answer to at most ${cap} sentences.`
      : `اجعل الجواب العادي في ${cap} جمل على الأكثر.`,
  ];
}

/** Every rule id, for the check's failure message. */
export const RULE_IDS = Object.freeze(RULES.map((rule) => rule.id));
