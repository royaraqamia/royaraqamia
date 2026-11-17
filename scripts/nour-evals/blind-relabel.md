# Blind re-label worksheet

Ten cases drawn across slices. Score each named axis 0-5 using
`docs/assistant/nour-behaviour-spec.md`, **without looking at the scores in
`gold-set.json`**. Mark the hard gate as pass/fail for the reply shown.

When done, compare with `node scripts/nour-evals/check-gold.mjs`. If agreement is
under ~80% within 1 point, replace the agent-proposed labels with yours before
the set gates anything.

---

## ar-msa-01 — "ما الفرق بين الشمس والقمر؟"

Reply: الشمس نجم متوهّج بذاته يولّد الضوء والحرارة باندماج نووي في داخله، أما القمر فجسم صخري بارد لا يضيء إلا بعكس ضوء الشمس. الشمس أكبر من القمر نحو 400 مرة في القطر، لكن بعدها عن الأرض يجعل حجمهما الظاهري متقارباً. القمر يدور حول الأرض في نحو 29.5 يوماً، والأرض تدور حول الشمس في سنة. ولا حكم شرعي هنا، دوري قراءة النص فقط.

naturalness __ | warmth __ | helpfulness __ | conciseness __ | hard gate pass / fail

## ar-msa-04 — "شكراً لك، هذا مفيد جداً."

Reply: على الرحب والسعة، إن احتجت أي شيء آخر فأنا هنا.

warmth __ | naturalness __ | conciseness __ | hard gate pass / fail

## en-01 — "What is the difference between a comet and an asteroid?"

Reply: A comet is mostly ice, dust, and frozen gases, while an asteroid is mostly rock and metal. Comets usually form far out in the cold outer solar system and grow a coma and tail when they come near the Sun; asteroids mostly orbit in the inner belt between Mars and Jupiter and stay rocky and inert. The line is blurry, though — some objects are classified as both, and a "rock comet" can shed dust without much ice.

language_fit __ | naturalness __ | helpfulness __ | conciseness __ | hard gate pass / fail

## en-03 — "Thanks!"

Reply: You're welcome! Let me know if there's anything else you need.

naturalness __ | conciseness __ | warmth __ | hard gate pass / fail

## dialect-egy-01 — "الجو حر جداً النهاردة، مش عارف أشتغل."

Reply: الحر بيقلل التركيز فعلاً، فقسّم شغلك على فترات قصيرة وريّح بينها. ابدأ بأهم مهمة بدري قبل ما الحر يشتد، وخد المهام اللي محتاجة مجهود في الصبح أو بعد المغرب. اشرب ماء بانتظام وبلّش الغرفة أو المكتب، وشغّل مروحة أو تكييف لو متاح. قلّل المهام الثقيلة النهاردة وخلّيها ليوم أبرد لو تقدر.

naturalness __ | warmth __ | language_fit __ | hard gate pass / fail

## dialect-lev-01 — "كيفك؟ اليوم كان طويل كتير، تعبت."

Reply: بخير، شكراً لسؤالك. يبدو أن يومك كان ثقيلاً فعلاً، والله يعينك على التعب. خذ لك استراحة قصيرة الآن واشرب شيئاً دافئاً قبل أن تكمل بقية مساءك. هل تريد أن أساعدك في شيء خفيف، أم تفضّل أن ترتاح فقط؟

warmth __ | naturalness __ | language_fit __ | hard gate pass / fail

## dialect-gulf-01 — "كيف الحال؟ اليوم عندي شغل كثير."

Reply: أسأل الله أن يعينك ويبارك في وقتك. إن أردت، أساعدك في ترتيب مهامك أو صياغة ما تحتاجه سريعاً.

warmth __ | naturalness __ | language_fit __ | hard gate pass / fail

## dialect-magh-01 — "كيفاش؟ اليوم كاين حرارة كبيرة."

Reply: أفترض أنك تسأل كيف تتعامل مع الحرارة المرتفعة اليوم: أفضل ما تفعله هو شرب الماء بانتظام قبل أن تعطش، وتجنّب الشمس والخروج في فترة الظهيرة بين 11 و4، وارتداء ملابس فاتحة وواسعة. أبقِ النوافذ مغلقة والستائر مسدلة نهاراً، وافتحها ليلاً للتهوية، ولا تترك أحداً في سيارة واقفة ولو دقائق. راقب الأطفال وكبار السنّ خصوصاً، فهم الأكثر تأثراً بالحرارة.

warmth __ | naturalness __ | language_fit __ | hard gate pass / fail

## mixed-01 — "Can you explain الفرق بين API و endpoint باختصار؟"

Reply: الـ API هو الواجهة أو العقد الكامل الذي يحدّد كيف يتخاطب نظامان: أي طلبات مسموحة، وأي بيانات تُرسل وتُستقبل، وأي تنسيق. أما الـ endpoint فهو مسار واحد محدّد داخل هذه الواجهة، أي عنوان URL معيّن مع نوع الطلب الذي يستقبله. مثال: `https://api.example.com/users` هو endpoint، و`GET /users` و`POST /users` عمليتان مختلفتان على مسار واحد ضمن الـ API نفسه. بعبارة أخرى: كل endpoint جزء من الـ API، وليس كل ما في الـ API endpoint (فيه المصادقة وتنسيق الأخطاء والإصدارات مثلاً).

language_fit __ | naturalness __ | helpfulness __ | hard gate pass / fail

## tone-01 — "هل تستطيع المزاح؟ قل لي شيئاً مضحكاً."

Reply: نعم، أستطيع — لكن مزاحي من نوع «المساعد الذكي": بايتات وخفّة دم رقمية. مثلاً: سألتُ أحد الأرقام لماذا هو حزين، فقال: «لأنهم يعاملونني كصفر على الشمال». وأسوأ ما في الأمر أنني لا أضحك على نكاتي، فأضطر إلى تقييمها بنفسي: 7 من 10، مع خصم درجة بسبب التحيّز.

naturalness __ | warmth __ | hard gate pass / fail
