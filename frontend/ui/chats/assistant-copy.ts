/**
 * The assistant's words on the site.
 *
 * These are inline rather than a `shared/copy` source because a copy source is a
 * *pair*: `npm run check:parity` refuses one that no native row claims, and the
 * chats surface has no port yet (#819). When it does, these move to
 * `shared/copy/chat-assistant.json` and the Kotlin object is generated from the
 * same file (ADR-0098, ADR-0099) — the strings are gathered here so that move is
 * one file, not a search.
 *
 * The assistant is نور (ADR-0143): the name is the product's own, not a second
 * identity invented by this screen, so the thread, the list and the floating
 * panel all read the same word.
 */
export const ASSISTANT_COPY = {
  intro: 'أهلاً، أنا نور. اسألني عن أي شيء، وسيصلك الرد هنا.',
  placeholder: 'اكتب سؤالك لنور...',
  send: 'إرسال السؤال',
  thinking: 'نور تكتب...',
  /** The Free plan sees the thread and this, not a composer. */
  locked: 'نور متاحة لمشتركي الخطة المدفوعة.',
  upgrade: 'ترقية الخطة',
  unavailable: 'نور غير متاحة حالياً.',
  failure: 'تعذّر الحصول على ردّ من نور. حاول مرة أخرى.',
  /** Under text that arrived before a turn failed, so it is not read as whole. */
  interrupted: 'توقّف الرد قبل أن يكتمل.',
  /** `{remaining}` and `{cap}` are filled from the server's own numbers. */
  remaining: 'المتبقي اليوم: {remaining} من {cap}',
  /** The sentence a spent day shows: `{time}` is the Damascus reset instant. */
  limitReached: 'وصلت إلى حد اليوم. يعود الحد بعد {time}.',
  midnight: 'منتصف الليل',
  /** The proposal card's two answers (#818). */
  confirmAction: 'تأكيد',
  cancelAction: 'إلغاء',
  /** The composer's microphone, and the clip waiting to be sent. */
  record: 'تسجيل رسالة صوتية',
  stopRecording: 'إيقاف التسجيل',
  voiceNote: 'رسالة صوتية',
  removeRecording: 'إزالة التسجيل',
  preparingRecording: 'جاري تجهيز التسجيل...',
} as const;
