// Local copy for the bounded rewrite endpoint (ADR-0220). The refusal sentence
// is returned by the server and shown by the IME; this is not a shared/copy
// source because the consent row is document-only and has no native pair.

export const KEYBOARD_REWRITE_COPY = {
  enableLabel: 'إعادة صياغة النص بالذكاء الاصطناعي',
  enableHint:
    'عند التفعيل يرسل ضغطك على زر إعادة الصياغة النص الذي تكتبه الآن إلى خدمتنا. لا يُرسل شيء أثناء الكتابة.',
  enabledLabel: 'إعادة الصياغة مفعّلة',
  revokeLabel: 'إلغاء التفعيل',
  rewriteLabel: 'صياغة',
  suggestionHint: 'اقتراح، اضغط لإدراجه',
  failure: 'تعذّرت إعادة الصياغة الآن، ولم يتغيّر نصك.',
  needsConsent: 'فعّل إعادة الصياغة من الحساب أولاً.',
} as const;

export type KeyboardRewriteCopyStrings = typeof KEYBOARD_REWRITE_COPY;
