// Local copy for a document-only surface (ADR-0219). This consent row has no
// native screen to pair with, so it is deliberately not a shared/copy source:
// check:parity would demand a port that does not exist. The IME's own labels
// live in the vendored keyboard module.

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
