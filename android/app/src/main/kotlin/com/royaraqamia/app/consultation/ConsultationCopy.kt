package com.royaraqamia.app.consultation

/**
 * The booking page's words (#930), copied from the page's own components.
 *
 * The surface is ported but switched off, so its copy source has not moved to
 * `shared/copy` yet: the generated pair lands with the visual gate that pairs it
 * with the page (`docs/mobile/two-clients.md` rule 5). One object until then
 * means there is still one place to move them from.
 */
object ConsultationCopy {
    const val PAGE_TITLE = "حجز استشارة"

    const val STEP_PACKAGE = "الباقة"
    const val STEP_SLOTS = "الموعد"
    const val STEP_DETAILS = "بياناتك"

    const val NEXT = "التَّالي"
    const val PREVIOUS = "السَّابق"
    const val RETRY = "إعادة المحاولة"
    const val CONFIRM = "تأكيد طلب الحجز"
    const val SUBMITTING = "جاري إرسال الطَّلب..."

    const val PACKAGES_LOADING = "جاري تحميل الباقات..."
    const val PACKAGES_ERROR = "تعذَّر تحميل الباقات. تحقَّق من اتِّصالك ثم أعِد المحاولة."
    const val PACKAGES_EMPTY = "لا توجد باقات متاحة حاليًا، يرجى المحاولة لاحقًا."

    const val SLOTS_LOADING = "جاري تحميل المواعيد المُتاحة..."
    const val SLOTS_ERROR = "تعذَّر تحميل المواعيد المُتاحة. تحقَّق من اتِّصالك ثم أعِد المحاولة."
    const val SLOTS_EMPTY_TITLE = "لا توجد مواعيد مُتاحة حاليًّا"
    const val SLOTS_EMPTY_BODY = "تُضاف مواعيد جديدة دوريًّا — جرِّب لاحقًا."
    const val SLOTS_STALE = "تعذَّر تحديث المواعيد — قد لا تعكس القائمة المعروضة أحدث المواعيد المُتاحة."
    const val DAMASCUS_PREFIX = "بتوقيت دمشق: "

    const val OFFLINE_BANNER =
        "الحجز يحتاج اتصالًا بالإنترنت لتأكيد الموعد المتاح. يمكنك الاطِّلاع على الباقات والمواعيد، ثم إتمام الحجز عند عودة الاتصال."
    const val OFFLINE_SUBMIT =
        "يلزم الاتصال بالإنترنت لإتمام الحجز. تحقَّق من اتِّصالك ثم أعِد المحاولة."

    const val NAME = "الاسم الكامل"
    const val NAME_PLACEHOLDER = "اكتب اسمك كما تُريد أن نُناديك"
    const val PHONE = "رقم واتساب"
    const val PHONE_PLACEHOLDER = "9XX XXX XXX"
    const val TOPIC = "موضوع الاستشارة — ماذا تُريد أن تُحقِّق؟"
    const val TOPIC_PLACEHOLDER =
        "اشرح هدفك أو المشكلة التي تُريد حلَّها حتَّى نُجهِّز لك أفضل استشارة ممكنة إن شاء الله..."
    const val TOPIC_HINT = "30 حرفًا على الأقل — كُلَّما وضَّحت أكثر، كانت الاستشارة أدق."

    const val ERR_NAME_SHORT = "الاسم يجب أن يكون حرفين على الأقل"
    const val ERR_NAME_LONG = "الاسم طويل جدًّا"
    const val ERR_PHONE = "رقم واتساب غير صحيح"
    const val ERR_TOPIC_SHORT = "اشرح موضوع الاستشارة بما لا يقل عن 30 حرفًا"
    const val ERR_TOPIC_LONG = "الوصف طويل جدًّا (2,000 حرف كحد أقصى)"
    const val ERR_PACKAGE = "الرَّجاء اختيار الباقة"
    const val ERR_SLOT_COUNT = "عدد المواعيد المُختارة لا يُطابق الباقة."

    const val BOOKING_FAILED = "تعذر إنشاء الحجز."
    const val GENERIC_ERROR = "حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى."
    const val BOOKING_UNREACHABLE =
        "تعذَّر إرسال طلب الحجز. تحقَّق من اتِّصالك ثم أعِد المحاولة."

    const val SUCCESS_TITLE = "تمَّ استلام طلبك بنجاح!"
    const val SUCCESS_MESSAGE =
        "احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب لتأكيد الحجز وإتمام الدَّفع إن شاء الله."
    const val REFERENCE_LABEL = "رقم الطَّلب"
    const val COPY = "نسخ"
    const val COPIED = "تمَّ النَّسخ"
    const val START_OVER = "إرسال طلب جديد"

    fun minutesLabel(minutes: Long): String = "$minutes دقيقة للجلسة"

    fun slotCount(required: Int): String =
        if (required == 1) "اختر موعدًا واحدًا"
        else "اختر $required مواعيد"

    fun slotCountProgress(selected: Int, required: Int): String =
        "${slotCount(required)} — تمَّ اختيار $selected من $required"
}
