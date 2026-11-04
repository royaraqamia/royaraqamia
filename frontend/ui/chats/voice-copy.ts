/**
 * The voice note's words, in one place because the member's composer and the
 * assistant's draw the same control and must not drift (ADR-0127).
 *
 * These are inline rather than a `shared/copy` source for the reason
 * `assistant-copy.ts` gives: a copy source is a *pair*, `npm run check:parity`
 * refuses one no native row claims, and the chats surface has no port yet
 * (#937). When it does, this file is what moves to `shared/copy/`.
 */
export const VOICE_COPY = {
  /** The paperclip, on both composers. */
  attach: 'إرفاق ملف',
  removeFile: 'إزالة {name}',
  /** The microphone and the bar it opens. */
  record: 'تسجيل رسالة صوتية',
  recording: 'جاري التسجيل',
  releaseToSend: 'اترك الزر للإرسال',
  slideToCancel: 'اسحب بعيداً للإلغاء',
  cancelRecording: 'إلغاء التسجيل',
  lockRecording: 'تثبيت التسجيل',
  unlockRecording: 'إلغاء التثبيت',
  stopAndSend: 'إيقاف وإرسال',
  limitReached: 'بلغت المدة القصوى (5 دقائق)، يُرسل التسجيل الآن.',
  preparing: 'جاري تجهيز التسجيل...',
  voiceNote: 'رسالة صوتية',
  removeRecording: 'إزالة التسجيل',
  /** The player. */
  play: 'تشغيل الرسالة الصوتية',
  pause: 'إيقاف تشغيل الرسالة الصوتية',
  speed: 'سرعة التشغيل',
  loadFailed: 'تعذّر تشغيل التسجيل',
} as const;

/**
 * A clip's length, as a player draws it. ASCII digits by the repo's rule, and
 * `m:ss` rather than a word so the timer and the player read the same way.
 */
export function formatVoiceDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
