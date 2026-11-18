/**
 * The sentences a failed assistant turn stores in `agent_turns.error`, and the
 * code the online quality report gives each one. The turn writes the sentence;
 * the report reads it back. Both import this file so a new known failure cannot
 * quietly become `other` (#1609).
 */

export const FAILURE_SENTENCES = Object.freeze({
  provider: 'تعذّر الحصول على ردّ من نور. حاول مرّة أخرى.',
  busy: 'نور مشغولة الآن، حاول بعد قليل.',
  unavailable: 'نور غير متاحة حالياً.',
  transcription: 'لم أستطع تحويل الصوت إلى نص. أعد إرساله أو اكتبه.',
  attachmentRead: 'لم أستطع قراءة المرفق. أعد إرساله أو اكتب سؤالك.',
  unreadableFile:
    'لا أستطيع قراءة هذا النوع من الملفات. أرسل صورة أو مستنداً أو ملفاً نصياً أو رسالة صوتية.',
  noTextLayer:
    'هذا المستند صور ممسوحة بلا نصّ يمكن قراءته. أرسل صور الصفحات نفسها، حتى ثلاث صور في الرسالة الواحدة، وسأقرأها.',
  emptyDocument: 'لا أجد نصاً في هذا المستند. أرسل نسخة أخرى أو اكتب سؤالك.',
  brokenDocument: 'لم أستطع فتح هذا المستند. أرسل نسخة أخرى أو اكتب سؤالك.',
  lockedDocument: 'هذا المستند محمي بكلمة سر، ولا أستطيع فتحه. أرسل نسخة غير محمية.',
  imageTooLarge: 'الصورة كبيرة جداً على نور. أرسل صورة أصغر أو اكتب سؤالك.',
});

/**
 * `sentences` names the FAILURE_SENTENCES keys a code covers; `aliases` covers
 * wording an older deployment stored before the copy changed. `other` is only
 * for text that matches none of them.
 */
export const FAILURE_CODES = Object.freeze({
  provider_failure: {
    cause: 'the provider returned no answer; the turn ended after its retry',
    sentences: ['provider'],
    aliases: ['تعذّر الحصول على ردّ من المساعد'],
  },
  provider_busy: {
    cause: 'a 402/429 capacity or billing refusal; the turn was retried once',
    sentences: ['busy'],
  },
  unavailable: {
    cause: 'provider key refused (401/403), or no client configured (503)',
    sentences: ['unavailable'],
  },
  transcription_failure: {
    cause: 'the voice note could not be transcribed',
    sentences: ['transcription'],
  },
  file_failure: {
    cause: 'the attachment could not be read: no text layer, empty, broken, locked or too large',
    sentences: [
      'attachmentRead',
      'unreadableFile',
      'noTextLayer',
      'emptyDocument',
      'brokenDocument',
      'lockedDocument',
      'imageTooLarge',
    ],
  },
  allowance: {
    cause: 'the plan or subscription limit refused the turn',
    aliases: ['الاشتراك', 'الخطط'],
  },
  other: { cause: 'an unrecognised error; add its sentence to FAILURE_CODES' },
});
