// The Scanner's page copy that has to exist twice: once as the accordion a
// visitor reads, and once as the `FAQPage` structured data a crawler reads. One
// list feeds both, so they cannot drift.

export interface ScanFaqItem {
  question: string;
  answer: string;
}

export const SCAN_FAQ_ITEMS: ScanFaqItem[] = [
  {
    question: 'هل تُرسَل صورة الكاميرا أو الصُّورة المرفوعة إلى خادمكم؟',
    answer:
      'لا. تتمُّ قراءة الرَّمز بالكامل داخل متصفِّحك، ولا يخرج من جهازك أيُّ إطار من الكاميرا ولا أيُّ صورة. الشَّيء الوحيد الذي يُرسَل — وفقط إذا كان الرَّمز رابطًا لشهادة من رؤيَة رقَميَّة — هو رمز الشَّهادة نفسه للتَّحقُّق منها.',
  },
  {
    question: 'هل يعمل الماسح بدون إنترنت؟',
    answer:
      'نعم. القراءة نفسها لا تحتاج اتصالًا، ويعمل الماسح دون إنترنت بعد أوَّل زيارة لك للصَّفحة. لا يحتاج الاتِّصال إلا للتَّحقُّق من شهادة صادرة عن رؤيَة رقَميَّة.',
  },
  {
    question: 'ما أنواع الرُّموز التي يدعمها الماسح؟',
    answer:
      'رموز QR وAztec وData Matrix وPDF417، والرُّموز الخطِّيَّة EAN-13 وEAN-8 وUPC-A وUPC-E وCode 39 وCode 93 وCode 128 وITF وCodabar وGS1 DataBar.',
  },
  {
    question: 'هل يُفتح الرَّابط الممسوح تلقائيًّا؟',
    answer:
      'لا، لا يُفتح أيُّ رابط تلقائيًّا. يُعرَض لك الرَّابط ووجهته الحقيقيَّة أوَّلًا لتقرِّر بنفسك، ولا يقدِّم الماسح زرَّ فتح للرَّوابط التي قد تُنفِّذ أوامر على جهازك مثل javascript: أو data:.',
  },
  {
    question: 'هل يحتفظ الماسح بسجلٍّ لما مسحته؟',
    answer:
      'لا. نتيجة كلِّ مسح تبقى في الصَّفحة فقط وتختفي بمجرَّد إغلاقها أو مسح رمز آخر؛ لا يُخزَّن أيُّ سجلٍّ على جهازك ولا على خادمنا.',
  },
  {
    question: 'ماذا يحدث عند مسح رمز شهادة صادرة عن رؤيَة رقَميَّة؟',
    answer:
      'يتعرَّف الماسح على روابط التَّحقُّق الخاصَّة بالشَّهادات ويعرض بيانات الشَّهادة مباشرة: اسم الطَّالب والدَّورة وتاريخ الإصدار وحالة الشَّهادة.',
  },
];

export function scanFaqSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: SCAN_FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
