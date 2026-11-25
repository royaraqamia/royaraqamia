package dev.patrickgold.florisboard.ime.rewrite

/**
 * The IME's own copy for its one network action (ADR-0220). The site's consent
 * row has no native screen to pair with, so this is not a generated shared copy
 * source; these strings belong to the keyboard surface alone.
 */
object RewriteCopy {
    const val ENABLE_LABEL = "إعادة صياغة النص بالذكاء الاصطناعي"
    const val ENABLE_HINT = "عند التفعيل يرسل ضغطك على زر إعادة الصياغة النص الذي تكتبه الآن إلى خدمتنا. لا يُرسل شيء أثناء الكتابة."
    const val ENABLED_LABEL = "إعادة الصياغة مفعّلة"
    const val REVOKE_LABEL = "إلغاء التفعيل"
    const val REWRITE_LABEL = "صياغة"
    const val SUGGESTION_HINT = "اقتراح، اضغط لإدراجه"
    const val FAILURE = "تعذّرت إعادة الصياغة الآن، ولم يتغيّر نصك."
    const val NEEDS_CONSENT = "فعّل إعادة الصياغة من الحساب أولاً."
}
