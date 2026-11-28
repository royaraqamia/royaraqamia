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
 * Nothing here names the assistant: the name is the member's (ADR-0229), and a
 * sentence that describes it is written without a gendered verb so it reads the
 * same at either voice.
 */
export const ASSISTANT_COPY = {
  placeholder: 'اكتب سؤالك...',
  send: 'إرسال السؤال',
  unavailable: 'المحادثة غير متاحة حالياً.',
  failure: 'تعذّر الحصول على ردّ. حاول مرة أخرى.',
  /** `{remaining}` and `{cap}` are filled from the server's own numbers. */
  remaining: 'المتبقي اليوم: {remaining} من {cap}',
  /**
   * The app-call meter beside the turn's (#1226). `{used}` and `{cap}` are the
   * `mcp.call` row of the catalogue; the spent sentence itself is
   * `CHAT_APP_CALLS_SPENT`, shared with the server so the refusal a turn hands
   * back is the line this composer draws.
   */
  appsMeter: 'تطبيقات: {used} من {cap} اليوم',
  /** The composer's microphone, and the clip waiting to be sent. */
  record: 'تسجيل رسالة صوتية',
  stopRecording: 'إيقاف التسجيل',
  voiceNote: 'رسالة صوتية',
  removeRecording: 'إزالة التسجيل',
  preparingRecording: 'جاري تجهيز التسجيل...',
} as const;
