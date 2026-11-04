package com.royaraqamia.app.leads

/**
 * The lead forms' words (#929), copied from the three pages' own components.
 *
 * The translation notes are the same as every other off port: the surface is
 * not switched on yet, so its copy source lands with the visual gate that pairs
 * it with the page (`docs/mobile/two-clients.md` rule 5). Keeping the strings
 * in one object until then means there is still one place to move them from.
 */
object LeadsCopy {
    // --- Titles and steps ---------------------------------------------------

    const val TRAINING_TITLE = "التَّسجيل في التَّدريب"
    const val PROJECT_TITLE = "طلب بناء مشروع"
    const val RETAINER_TITLE = "طلب التَّعاقُد الشَّهري"

    const val TRAINING_STEP_COHORT = "الدُّفعة"
    const val PROJECT_STEP_TYPE = "نوع المشروع"
    const val PROJECT_STEP_DETAILS = "تفاصيل المشروع"
    const val RETAINER_STEP_PROJECTS = "مشاريعك"
    const val RETAINER_STEP_NEEDS = "الاحتياجات"
    const val STEP_DETAILS = "بياناتك"
    const val STEP_CONTACT = "بياناتك"

    // --- Controls -----------------------------------------------------------

    const val NEXT = "التَّالي"
    const val PREVIOUS = "السَّابق"
    const val SUBMIT_TRAINING = "أرسِل طلب التَّسجيل"
    const val SUBMIT_PROJECT = "أرسِل طلب المشروع"
    const val SUBMIT_RETAINER = "أرسِل طلب التَّعاقُد"
    const val SUBMITTING = "جاري الإرسال..."
    const val START_OVER = "إرسال طلب جديد"
    const val COPY = "نسخ"
    const val COPIED = "تمَّ النَّسخ"

    // --- Confirmation -------------------------------------------------------

    const val QUEUED_TITLE = "حُفِظ طلبك على هذا الجهاز"
    const val QUEUED_BODY =
        "أنت غير متَّصل بالإنترنت حاليًّا. سنُرسِل طلبك تلقائيًّا عند عودة الاتصال، وسيظهر رقم الطَّلب هنا فور وصوله."
    const val SUCCESS_TITLE = "تمَّ استلام طلبك بنجاح!"
    const val REFERENCE_LABEL = "رقم الطَّلب"
    const val SUCCESS_TRAINING =
        "احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك خلال 48 ساعة عبر واتساب لتأكيد التحاقك بالدَّورة."
    const val SUCCESS_PROJECT =
        "احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب خلال 48 ساعة."
    const val SUCCESS_RETAINER =
        "احتفظ برقم الطَّلب أدناه — سنُراجع طلبك ونتواصل معك عبر واتساب خلال 48 ساعة إن شاء الله."
    const val GENERIC_ERROR = "حدث خطأ غير متوقَّع. الرَّجاء المحاولة مرَّة أخرى."

    // --- Fields -------------------------------------------------------------

    const val FULL_NAME = "الاسم الكامل"
    const val FULL_NAME_PLACEHOLDER = "مثال: أحمد العلي"
    const val FULL_NAME_PLACEHOLDER_RETAINER = "مثال: مُحمَّد الحسن"
    const val PHONE = "رقم واتساب"
    const val PHONE_PLACEHOLDER = "9XX XXX XXX"
    const val PHONE_HELP = "اختر رمز الدولة ثم اكتب رقمك — سنتواصل معك على هذا الرَّقم."
    const val PHONE_HELP_RETAINER =
        "اختر رمز الدَّولة ثمَّ اكتب رقمك — سنتواصل معك على هذا الرَّقم إن شاء الله."
    const val EMAIL = "البريد الإلكتروني"
    const val EMAIL_PLACEHOLDER = "name@example.com"
    const val GOAL = "ماذا تريد أن تبني؟"
    const val GOAL_PLACEHOLDER =
        "مثال: أريد إطلاق متجر إلكتروني صغير، أو تحويل فكرة تطبيق إلى منتج أوَّل."
    const val COMPANY = "الشَّركة"
    const val COMPANY_PLACEHOLDER = "مثال: شركة النُّور للتِّجارة"
    const val CURRENT_PROJECTS = "المشاريع التي لديك"
    const val CURRENT_PROJECTS_PLACEHOLDER =
        "اذكر مشاريعك القائمة: نوعها، تقنيتها إن عرفتها، وحالتها الحاليَّة."
    const val NEEDS = "ما تحتاج صيانته أو تطويره"
    const val NEEDS_PLACEHOLDER =
        "حدِّد ما تريد أن نتولَّاه شهريًّا: صيانة، إصلاح أعطال، إضافة ميِّزات، متابعة وإدارة."
    const val PREFERRED_START = "تاريخ البدء المفضَّل"
    const val PREFERRED_START_PLACEHOLDER = "مثال: 2026-01-01"
    const val DESCRIPTION = "وصف المشروع"
    const val DESCRIPTION_PLACEHOLDER =
        "اشرح ما تريد بناءه: الهدف من المشروع، الفئة المستهدفة، وأهم الميزات التي تحتاجها."
    const val BUDGET_RANGE = "الميزانية المتوقَّعة"
    const val TIMELINE = "المدَّة المتوقَّعة"
    const val UNSET = "غير محدَّد"
    const val EXISTING_URL = "رابط مشروع قائم"
    const val EXISTING_URL_PLACEHOLDER = "https://example.com"

    // --- Project type -------------------------------------------------------

    const val TYPE_WEBSITE = "موقع"
    const val TYPE_APP = "تطبيق"
    const val TYPE_WEBSITE_BACKEND = "بدون Backend"
    const val TYPE_APP_BACKEND = "مع Backend"

    // --- Cohorts ------------------------------------------------------------

    const val CHOOSE_COHORT = "اختر الدُّفعة"
    const val COHORT_INTRO =
        "اختر الدُّفعة التي تناسبك. المقاعد محدودة، ويُثبَّت مقعدك عند تأكيد تسجيلك معنا."
    const val NO_COHORTS_TITLE = "لا توجد دُفعات مفتوحة للتَّسجيل حاليًّا."
    const val NO_COHORTS_BODY =
        "لا يمكنك إرسال الطَّلب دون اختيار دُفعة. تابعنا عبر واتساب وسنُعلمك عند فتح الدُّفعة القادمة."
    const val SEATS_LEFT = "المقاعد المتاحة: {count}"
    const val SEATS_FULL = "مكتملة"

    // --- Validation (the contracts' own sentences) --------------------------

    const val ERR_NAME_SHORT = "الاسم يجب أن يكون حرفين على الأقل"
    const val ERR_NAME_LONG = "الاسم طويل جدًّا"
    const val ERR_PHONE = "رقم واتساب غير صحيح"
    const val ERR_EMAIL_LONG = "البريد الإلكتروني طويل جدًّا"
    const val ERR_EMAIL = "البريد الإلكتروني غير صحيح"
    const val ERR_GOAL_LONG = "النصّ طويل جدًّا (1,000 حرف كحد أقصى)"
    const val ERR_COHORT_REQUIRED = "الرَّجاء اختيار الدُّفعة"
    const val ERR_COHORT_INVALID = "الدُّفعة المختارة غير صحيحة"
    const val ERR_PROJECT_TYPE = "نوع المشروع غير صحيح"
    const val ERR_DESCRIPTION_SHORT = "اشرح المشروع بما لا يقل عن 30 حرفًا"
    const val ERR_DESCRIPTION_LONG = "الوصف طويل جدًّا (2,000 حرف كحد أقصى)"
    const val ERR_BUDGET = "الميزانيَّة غير صحيحة"
    const val ERR_TIMELINE = "المدَّة غير صحيحة"
    const val ERR_URL_LONG = "الرَّابط طويل جدًّا"
    const val ERR_URL = "رابط غير صحيح"
    const val ERR_COMPANY_LONG = "اسم الشركة طويل جدًّا"
    const val ERR_PROJECTS_SHORT = "اذكر المشاريع التي لديك بما لا يقل عن 30 حرفًا"
    const val ERR_PROJECTS_LONG = "وصف المشاريع طويل جدًّا (2,000 حرف كحد أقصى)"
    const val ERR_NEEDS_SHORT = "اشرح ما تحتاج صيانته بما لا يقل عن 30 حرفًا"
    const val ERR_NEEDS_LONG = "وصف الاحتياجات طويل جدًّا (2,000 حرف كحد أقصى)"
    const val ERR_DATE = "تاريخ غير صحيح"
    const val ERR_DATE_PAST = "تاريخ البدء يجب أن يكون اليوم أو بعده"
}
