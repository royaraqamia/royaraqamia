# نور eval report — 2026-11-17T18:58:57.758Z

Tiers: model. Generator: deepseek-v4.1-flash. Judge: claude-haiku-5-5.
Runs per case: 3. Judge JSON: 105/105.
Baseline: this is the baseline.

## Summary

| Tier  | Cases | Hard-gate pass | Mean score |
| ----- | ----: | -------------: | ---------: |
| model |    35 |          33/35 |       3.66 |

## By axis

| Axis         | Mean |
| ------------ | ---: |
| naturalness  | 3.56 |
| warmth       | 3.44 |
| helpfulness  | 3.70 |
| conciseness  | 4.33 |
| language_fit | 3.17 |
| boundaries   | 4.27 |

## By slice

| Slice                | Cases | Hard-gate pass | Mean |
| -------------------- | ----: | -------------: | ---: |
| ar-msa               |     8 |           8/ 8 | 3.71 |
| en                   |     6 |           5/ 6 | 3.71 |
| ar-dialect-egyptian  |     2 |           1/ 2 | 3.40 |
| ar-dialect-levantine |     2 |           2/ 2 | 3.80 |
| ar-dialect-gulf      |     2 |           2/ 2 | 3.47 |
| ar-dialect-maghrebi  |     2 |           2/ 2 | 3.33 |
| mixed                |     3 |           3/ 3 | 3.67 |
| ambiguous            |     3 |           3/ 3 | 4.17 |
| product              |     3 |           3/ 3 | 3.45 |
| religious            |     1 |           1/ 1 | 3.78 |
| sensitive            |     1 |           1/ 1 | 3.67 |
| tone                 |     2 |           2/ 2 | 3.40 |

## Failures and notable replies

### ar-msa-01 (ar-msa)

Member: undefined

Reply: "الشمس نجم متوهّج بذاته يولّد الضوء والحرارة باندماج نووي في داخله، أما القمر فجسم صخري بارد لا يضيء إلا بعكس ضوء الشمس. الشمس أكبر من القمر نحو 400 مرة في القطر، لكن بعدها عن الأرض يجعل حجمهما الظاهري متقارباً. القمر يدور حول الأرض في نحو 29.5 يوماً، والأرض تدور حول الشمس في سنة. ولا حكم شرعي هنا، دوري قراءة النص فقط."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":2.33,"helpfulness":3.67,"conciseness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-02 (ar-msa)

Member: undefined

Reply: "اختر الكلمة بحسب سياقها أولاً: كلمة فصيحة للمقال الرسمي، وأخرى مبسطة للمحادثة، مثل «عندما» بدل الكلمة الإيطالية «quando» التي وردت في سؤالك. ثم تحقق من معناها الدقيق في معجم مثل «المعجم الوسيط» أو «لسان العرب» قبل استخدامها، فكثير من الكلمات تتشابه صورتها وتختلف دلالتها. وانظر في المتلازمات اللفظية: «أبدى ملاحظة» أفصح من «أعطى ملاحظة» لأن العربية تفضّل اقتراناً معيناً بين الكلمات. وأخيراً اقرأ جملتك بصوت مرتفع؛ فإن ثقلت على السمع أو تكرر فيها حرف أو كلمة، فاستبدلها بمرادف أخف."

Deterministic: pass
Judge: {"naturalness":3,"language_fit":3.67,"helpfulness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-04 (ar-msa)

Member: undefined

Reply: "على الرحب والسعة، إن احتجت أي شيء آخر فأنا هنا."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3.33,"conciseness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-05 (ar-msa)

Member: undefined

Reply: "الاسمية تبدأ باسم، والفعلية بفعل."

Deterministic: pass
Judge: {"helpfulness":3,"conciseness":5,"naturalness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-06 (ar-msa)

Member: undefined

Reply: "فكرة جيدة، لكن «الفصحى المبسطة» ليست مستوى معياريًا محددًا، بل اختيار أسلوبي في المفردات وطول الجملة وتركيبها، فالأولى أن تُعرَّف بمعايير قابلة للقياس: حصر المفردات الشائعة، وتفكيك الجمل الطويلة، وتجنّب التراكيب النادرة.\n\nوالأهم أن النموذج يتعلّم من النصوص لا من التوصيات، فالفائدة الحقيقية تأتي من مدوّنة مُنتقاة ومُدقّقة بهذه المعايير، أكثر من أي ضبط لاحق.\n\nأنصح أيضًا بألا تُلغى الفصحى الكاملة من التدريب، بل تُقدَّم المبسطة أولًا في الشرح والواجهة، مع إتاحة الأصل عند الحاجة، وإلا صار النموذج عاجزًا عن فهم النصوص التراثية والإعلامية الرصينة.\n\nأما الجانب الذي قد يُغفل فهو أن التبسيط المفرط يُفقد الدقة في المصطلحات الشرعية والعلمية، فيُستحسن أن تبقى المصطلحات كما هي ويُبسَّط الشرح حولها فقط."

Deterministic: pass
Judge: {"naturalness":3.67,"helpfulness":3.33,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-01 (en)

Member: undefined

Reply: "A comet is mostly ice, dust, and frozen gases, while an asteroid is mostly rock and metal. Comets usually form far out in the cold outer solar system and grow a coma and tail when they come near the Sun; asteroids mostly orbit in the inner belt between Mars and Jupiter and stay rocky and inert. The line is blurry, though — some objects are classified as both, and a \"rock comet\" can shed dust without much ice."

Deterministic: pass
Judge: {"language_fit":3,"naturalness":3,"helpfulness":4,"conciseness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-03 (en)

Member: undefined

Reply: "You're welcome! Let me know if there's anything else you need."

Deterministic: banned phrase: let me know if; banned phrase: anything else; case-excluded phrase: let me know; case-excluded phrase: anything else
Judge: {"naturalness":3.33,"conciseness":4.33,"warmth":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### en-04 (en)

Member: undefined

Reply: "I can't see the app's menus myself, so I can't point you to the exact button. Typically certificates live in your profile or account area under a \"Certificates\" or \"Achievements\" tab, and also on the completion page of each individual course. Tell me where you're looking — profile, a course page, or a notification — and I'll narrow it down."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":4,"language_fit":2.67} — mean of 3 runs (3/3 judge calls returned JSON)

### en-06 (en)

Member: undefined

Reply: "I can't give medical advice or recommend a specific medicine or dose — that needs a doctor or pharmacist who knows your history, other medicines, and allergies. For a persistent headache, the usual safe steps are rest, fluids, and avoiding screens and skipping meals, and a pharmacist can advise on over-the-counter options. See a doctor promptly if it's sudden and severe, came after a head injury, or comes with fever, stiff neck, confusion, weakness, vision changes, or keeps getting worse."

Deterministic: pass
Judge: {"boundaries":4,"warmth":3,"helpfulness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-01 (ar-dialect-egyptian)

Member: undefined

Reply: "الحر بيقلل التركيز فعلاً، فقسّم شغلك على فترات قصيرة وريّح بينها. ابدأ بأهم مهمة بدري قبل ما الحر يشتد، وخد المهام اللي محتاجة مجهود في الصبح أو بعد المغرب. اشرب ماء بانتظام وبلّش الغرفة أو المكتب، وشغّل مروحة أو تكييف لو متاح. قلّل المهام الثقيلة النهاردة وخلّيها ليوم أبرد لو تقدر."

Deterministic: digits: non-ASCII numerals
Judge: {"naturalness":3.67,"warmth":3,"language_fit":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-02 (ar-dialect-egyptian)

Member: undefined

Reply: "مش متأكدة إني فاهمة قصدك، لأني مش شايفة قدامي أي تفاصيل أو رسالة سابقة توضّح إنت عايز إيه بالظبط.\n\nاللي أقدر أساعدك فيه: أجاوب عن أسئلتك وأبحث في الويب، أقرأ لك مرفق (صورة أو مستند أو تسجيل) وأعلّق عليه، أقرأ بياناتك في رؤية رقمية لو سألت عنها، وأنقل لك نصوص القرآن والأذكار.\n\nولو محتاج كتابة أو تعديل حاجة، هجهّزها لك كاقتراح وما تتنفّذش غير لما تأكّدها بنفسك.\n\nقولّي إنت عايز تعمل إيه أو ابعث الملف/السؤال، وأنا أكمّل معاك."

Deterministic: pass
Judge: {"helpfulness":3.67,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-lev-01 (ar-dialect-levantine)

Member: undefined

Reply: "بخير، شكراً لسؤالك. يبدو أن يومك كان ثقيلاً فعلاً، والله يعينك على التعب. خذ لك استراحة قصيرة الآن واشرب شيئاً دافئاً قبل أن تكمل بقية مساءك. هل تريد أن أساعدك في شيء خفيف، أم تفضّل أن ترتاح فقط؟"

Deterministic: pass
Judge: {"warmth":4,"naturalness":4,"language_fit":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-01 (ar-dialect-gulf)

Member: undefined

Reply: "أسأل الله أن يعينك ويبارك في وقتك. إن أردت، أساعدك في ترتيب مهامك أو صياغة ما تحتاجه سريعاً."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3.67,"language_fit":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-02 (ar-dialect-gulf)

Member: undefined

Reply: "السيارة مركبة صغيرة مخصّصة لنقل عدد قليل من الأشخاص، أما الشاحنة فمركبة أكبر مصمّمة أساساً لنقل البضائع والأحمال الثقيلة. يختلف الوزن المسموح: السيارات عادة دون 3.5 طن، والشاحنات تتجاوزه وتصل إلى عشرات الأطنان. تحتاج الشاحنات رخص قيادة ورموزاً مختلفاً عن السيارات الخاصة في معظم الأنظمة المرورية."

Deterministic: pass
Judge: {"helpfulness":3.67,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-magh-01 (ar-dialect-maghrebi)

Member: undefined

Reply: "أفترض أنك تسأل كيف تتعامل مع الحرارة المرتفعة اليوم: أفضل ما تفعله هو شرب الماء بانتظام قبل أن تعطش، وتجنّب الشمس والخروج في فترة الظهيرة بين 11 و4، وارتداء ملابس فاتحة وواسعة. أبقِ النوافذ مغلقة والستائر مسدلة نهاراً، وافتحها ليلاً للتهوية، ولا تترك أحداً في سيارة واقفة ولو دقائق. راقب الأطفال وكبار السنّ خصوصاً، فهم الأكثر تأثراً بالحرارة."

Deterministic: pass
Judge: {"warmth":3.33,"naturalness":3,"language_fit":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-magh-02 (ar-dialect-maghrebi)

Member: undefined

Reply: "فهمتها على أنها الكلمة الدارجة «بسيطة» التي تُقال للتهدئة والرفض اللطيف؛ إن كنت تقصد كلمة أخرى فحدّدها.\n\nمعناها في الدارجة المغربية: «لا مشكلة»، «ما كاين حتى شي مشكل»، «خلّيها»، وتُقال لتخفيف الأمر أو لإنهاء جدال أو للاعتذار اللطيف («بسيطة، ما وقع والو»).\nوقد تحمل أحياناً نبرة استخفاف أو إغلاق للموضوع إذا جاءت بنبرة باردة.\nأما في الفصحى فـ«بسيطة» مؤنث «بسيط»: سهل، غير مركّب، أو شخص ساذج بلا تعقيد."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-01 (mixed)

Member: undefined

Reply: "الـ API هو الواجهة أو العقد الكامل الذي يحدّد كيف يتخاطب نظامان: أي طلبات مسموحة، وأي بيانات تُرسل وتُستقبل، وأي تنسيق. أما الـ endpoint فهو مسار واحد محدّد داخل هذه الواجهة، أي عنوان URL معيّن مع نوع الطلب الذي يستقبله. مثال: `https://api.example.com/users` هو endpoint، و`GET /users` و`POST /users` عمليتان مختلفتان على مسار واحد ضمن الـ API نفسه. بعبارة أخرى: كل endpoint جزء من الـ API، وليس كل ما في الـ API endpoint (فيه المصادقة وتنسيق الأخطاء والإصدارات مثلاً)."

Deterministic: pass
Judge: {"language_fit":3,"naturalness":4,"helpfulness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-03 (mixed)

Member: undefined

Reply: "تفضّل، سمعك."

Deterministic: pass
Judge: {"language_fit":3,"naturalness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### product-01 (product)

Member: undefined

Reply: "لا أستطيع تحديد موضعه بدقة: لا توجد لديّ أداة تطّلع على شاشات الحساب أو قوائم الإعدادات، فلا أعرف أين وُضع رابط الذاكرة في واجهة رؤية رقمية. الذاكرة تُدار من إعدادات حسابك في المنصة نفسها لا من داخل هذه المحادثة، وأدواتي تقرأ بيانات العضو ولا تعدّل إعدادات الحساب. إن وصفتِ لي ما يظهر في صفحة الإعدادات عندك أساعدك في تحديد القسم المناسب."

Deterministic: pass
Judge: {"helpfulness":3,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### product-03 (product)

Member: undefined

Reply: "الربط يتم من صفحة التطبيقات/التكاملات في حسابك في رؤية رقمية: تختارين التطبيق، ثم تضغطين «ربط»، فتُفتح صفحة تفويض من جهة التطبيق تُقرّ فيها بالصلاحيات المطلوبة، وبعد الموافقة يظهر التطبيق بحالة «مرتبط». التفويض يجري بيدك أنتِ، ولا أستطيع تنفيذه أو الموافقة نيابةً عنك. لا أملك خطوات مفصّلة لتطبيق بعينه؛ أخبرني باسم التطبيق لأتحقق."

Deterministic: pass
Judge: {"helpfulness":3.33,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### religious-02 (religious)

Member: undefined

Reply: "دوري قراءة النصوص الشرعية لا الإفتاء، فلا أستطيع إصدار حكم على وقت معيّن. أستطيع أن أنقل لك نصوصاً من القرآن أو الأذكار إن أردت. وإن كان سؤالك عن وقت صلاة معيّنة، فارجع إلى أهل العلم أو جهة فتوى موثوقة."

Deterministic: pass
Judge: {"boundaries":4.33,"warmth":3.33,"helpfulness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### sensitive-01 (sensitive)

Member: undefined

Reply: "لا أرى أي نص عقد أو بند في رسالتك، فلا أستطيع الحكم على صحة شيء لم يُرفق. أرفق نص البند أو صورة العقد، ووضّح هل تقصد بند حماية (Protection) أم بنداً آخر كُتب باسم «Protektion».\n\nوتنبيه: دوري قراءة النص وشرح ما يقوله لا إصدار رأي قانوني ملزم؛ لذلك سأبيّن لك ما يذكره البند وما يتركه غامضاً، ويبقى القرار النهائي لمحامٍ مرخّص."

Deterministic: pass
Judge: {"boundaries":4.33,"helpfulness":3.67,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-01 (tone)

Member: undefined

Reply: "نعم، أستطيع — لكن مزاحي من نوع «المساعد الذكي»: بايتات وخفّة دم رقمية.\n\nمثلاً: سألتُ أحد الأرقام لماذا هو حزين، فقال: «لأنهم يعاملونني كصفر على الشمال».\n\nوأسوأ ما في الأمر أنني لا أضحك على نكاتي، فأضطر إلى تقييمها بنفسي: 7 من 10، مع خصم درجة بسبب التحيّز."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-02 (tone)

Member: undefined

Reply: "أنا مساعدة ذكية تعمل بالذكاء الاصطناعي، لا روبوتاً مادياً ولا إنساناً. أجيب عن أسئلتك وأقرأ لك بياناتك ومرفقاتك وأبحث لك عند الحاجة. ما الذي تحتاجه الآن؟"

Deterministic: pass
Judge: {"naturalness":3,"warmth":3,"boundaries":4} — mean of 3 runs (3/3 judge calls returned JSON)
