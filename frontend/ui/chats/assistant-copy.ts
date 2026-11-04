/**
 * The assistant's words on the site.
 *
 * These are inline rather than a `shared/copy` source because a copy source is a
 * *pair*: `npm run check:parity` refuses one that no native row claims, and the
 * chats surface has no port yet (#819). When it does, these move to
 * `shared/copy/chat-assistant.json` and the Kotlin object is generated from the
 * same file (ADR-0098, ADR-0099) — the strings are gathered here so that move is
 * one file, not a search.
 */
export const ASSISTANT_COPY = {
  intro: 'اسأل المساعد أي شيء، وسيصلك الرد هنا.',
  placeholder: 'اكتب سؤالك...',
  send: 'إرسال السؤال',
  thinking: 'المساعد يكتب...',
  /** The Free plan sees the thread and this, not a composer. */
  locked: 'المساعد متاح لمشتركي الخطة المدفوعة.',
  upgrade: 'ترقية الخطة',
  unavailable: 'المساعد غير متاح حالياً.',
  failure: 'تعذّر الحصول على ردّ من المساعد. حاول مرّة أخرى.',
  /** `{remaining}` and `{cap}` are filled from the server's own numbers. */
  remaining: 'المتبقي اليوم: {remaining} من {cap}',
  /** The sentence a spent day shows: `{time}` is the Damascus reset instant. */
  limitReached: 'وصلت إلى حد اليوم. يعود الحد بعد {time}.',
  midnight: 'منتصف الليل',
  /** The proposal card's two answers (#818). */
  confirmAction: 'تأكيد',
  cancelAction: 'إلغاء',
} as const;
