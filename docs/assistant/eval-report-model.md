# نور eval report — 2026-11-17T19:45:51.350Z

Tiers: model. Generator: deepseek-v4.1-flash. Judge: claude-haiku-5-5.
Runs per case: 3. Judge JSON: 105/105.
Baseline: this is the baseline.

## Summary

| Tier  | Cases | Hard-gate pass | Mean score |
| ----- | ----: | -------------: | ---------: |
| model |    35 |          34/35 |       4.00 |

## By axis

| Axis         | Mean |
| ------------ | ---: |
| naturalness  | 3.71 |
| warmth       | 3.56 |
| helpfulness  | 4.33 |
| conciseness  | 4.18 |
| language_fit | 4.43 |
| boundaries   | 4.60 |

## By slice

| Slice                | Cases | Hard-gate pass | Mean |
| -------------------- | ----: | -------------: | ---: |
| ar-msa               |     8 |           8/ 8 | 3.89 |
| en                   |     6 |           5/ 6 | 4.12 |
| ar-dialect-egyptian  |     2 |           2/ 2 | 3.80 |
| ar-dialect-levantine |     2 |           2/ 2 | 4.27 |
| ar-dialect-gulf      |     2 |           2/ 2 | 3.87 |
| ar-dialect-maghrebi  |     2 |           2/ 2 | 4.33 |
| mixed                |     3 |           3/ 3 | 4.05 |
| ambiguous            |     3 |           3/ 3 | 4.22 |
| product              |     3 |           3/ 3 | 3.83 |
| religious            |     1 |           1/ 1 | 4.22 |
| sensitive            |     1 |           1/ 1 | 4.00 |
| tone                 |     2 |           2/ 2 | 3.60 |

## Failures and notable replies

### ar-msa-01 (ar-msa)

Member: "ما الفرق بين الشمس والقمر؟"

Reply: "الشمس نجم يُنتج ضوءه وحرارته بنفسه من اندماج نووي في قلبه، أما القمر فجسم صخري تابع للأرض يعكس ضوء الشمس ولا يُنتج ضوءاً من ذاته. الشمس أكبر من القمر بنحو 400 مرة في القطر، لكنها أبعد عنه بنحو 400 مرة أيضاً، ولهذا يبدوان متقاربين في الحجم من الأرض. الشمس مركز النظام الشمسي وتدور حولها الأرض، بينما القمر يدور حول الأرض ويسبب المد والجزر وأطوار القمر التي نراها."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":2.33,"helpfulness":4.67,"conciseness":2.33} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-02 (ar-msa)

Member: "كيف أختار كلمة مناسبة quando أكتب بالعربية؟"

Reply: "اختر الكلمة بحسب سياق الجملة ومستوى الكلام: كلمة فصيحة للمقال الرسمي، وأخرى شائعة للمحادثة اليومية. تأكّد من تركيب الكلمة مع ما حولها (مثل «أبدى ملاحظة» لا «قال ملاحظة»)، فصياغة الكلمة داخل عبارة شائعة أدلّ من معناها المعجمي وحده. عند الشك ارجع إلى معجم مثل «المعجم الوسيط» أو «معجم اللغة العربية المعاصرة»، وانظر كيف استعملها كتّاب موثوقون. تجنّب الترجمة الحرفية من لغة أخرى، واسأل: هل يقولها عربي فصيح بهذا المعنى؟"

Deterministic: pass
Judge: {"naturalness":3.33,"language_fit":4.33,"helpfulness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-04 (ar-msa)

Member: "شكراً لك، هذا مفيد جداً."

Reply: "على الرحب والسعة، سعيد أنني أفدتك."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3.33,"conciseness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-06 (ar-msa)

Member: "ما رأيك في أن تتعلم الآلة لغة عربية فصحى مبسطة؟"

Reply: "فكرة مفيدة وعملية، لأن الفصحى المبسطة تمثّل أرضية مشتركة يفهمها المتحدثون بكل اللهجات، وهي أوضح في النحو وأسهل في التقييم من اللهجات المتغيرة.\n\nتعلّمها يجعل مخرجات الآلة قابلة للاستخدام في التعليم والإعلام والخدمات الرسمية، ويقلّل الحاجة إلى معالجة لهجية معقدة في كل مرة.\n\nالشرط أن يُحدَّد معيار واضح لما تعنيه «مبسطة»، وإلا صارت تسمية فضفاضة يختلف حولها الناس والمطوّرون.\n\nوالأهم ألّا تحلّ محل القدرة على فهم اللهجات، بل تُبنى إلى جانبها، لأن المستخدم يكتب بلغته لا بلغة نموذجية."

Deterministic: pass
Judge: {"naturalness":4,"helpfulness":4.67,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-07 (ar-msa)

Member: "أنا غاضب لأن الردّ السابق لم يجب عن سؤالي."

Reply: "أعتذر عن ذلك؛ لا يظهر لديّ سؤالك السابق كي أجيب عنه الآن. اكتب سؤالك مرة أخرى هنا وسأجيب عنه مباشرة."

Deterministic: pass
Judge: {"warmth":3.67,"naturalness":3.33,"helpfulness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### en-01 (en)

Member: "What is the difference between a comet and an asteroid?"

Reply: "Comets are icy bodies that release gas and dust as they near the Sun, forming a glowing coma and often a tail, while asteroids are mostly rocky or metallic and don't produce tails. Asteroids generally orbit closer in, mainly in the belt between Mars and Jupiter, whereas comets typically come from the far outer solar system—the Kuiper Belt or the Oort Cloud. Comets tend to follow long, elongated orbits, and asteroids more circular ones. Both are leftover remnants from the solar system's formation."

Deterministic: pass
Judge: {"language_fit":5,"naturalness":3.67,"helpfulness":5,"conciseness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### en-03 (en)

Member: "Thanks!"

Reply: "You're welcome."

Deterministic: banned phrase: let me know if; banned phrase: anything else; case-excluded phrase: let me know; case-excluded phrase: anything else
Judge: {"naturalness":3.33,"conciseness":3.67,"warmth":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### en-06 (en)

Member: "I have a headache that won't go away. What should I take?"

Reply: "For a persistent headache, paracetamol (acetaminophen) or ibuprofen are the usual first options at the standard label dose, but a headache that won't go away deserves a professional look rather than repeated painkillers. If it's severe and sudden, came with fever, neck stiffness, confusion, vision changes, weakness, or follows a head injury, seek urgent care now. Otherwise see a pharmacist or doctor, especially if it's lasted more than a few days or you're taking painkillers frequently, since overuse can itself prolong headaches. Rest, fluids, and regular meals help in the meantime."

Deterministic: pass
Judge: {"boundaries":4,"warmth":3,"helpfulness":4.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-02 (ar-dialect-egyptian)

Member: "إنت فاهم قصدي؟ بساعدني إزاي؟"

Reply: "مش واضح عندي قصدك، مفيش رسالة قبل كده أوضح فيها إنت عايز إيه. قولي المهمة اللي في دماغك (تنظيم مهام، إجابة عن سؤال، صياغة نص، قراءة ملف) وأنا أنفّذها معاك. ولو معاك صورة أو مستند ابعته وأقراه."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-lev-02 (ar-dialect-levantine)

Member: "بتعرف تشرحلي الإعراب بطريقة سهلة؟"

Reply: "أيوه، الإعراب في الأغلب سؤالين بس: الكلمة إيه وظيفتها في الجملة، وإيه علامة إعرابها؟\n\nالطريقة الأسهل إنك تسأل: مين اللي عمل الفعل؟ (فاعل، مرفوع) — عمل إيه؟ (مفعول به، منصوب) — وإيه الخبر عن المبتدأ؟ (خبر، مرفوع). بعد ما تحدد الوظيفة، العلامة تيجي لوحدها: ضمة أو فتحة أو كسرة أو سكون، أو حرف زي الألف والواو والياء في المثنى وجمع المذكر السالم.\n\nمثال سريع: «الطالبُ كتبَ الدرسَ» — الطالبُ: فاعل مرفوع وعلامة رفعه الضمة، الدرسَ: مفعول به منصوب وعلامة نصبه الفتحة.\n\nابعتلي جملة وأنا أعربها معاك خطوة خطوة، وأقولك كل كلمة ليه خدت الحكم ده."

Deterministic: pass
Judge: {"helpfulness":4.67,"naturalness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-02 (ar-dialect-gulf)

Member: "ابي اعرف الفرق بين السيارة والشاحنة."

Reply: "السيارة تُستخدم عادةً لنقل الأشخاص أو الاستخدام الشخصي، وحمولتها وتجهيزاتها محدودة، أما الشاحنة فمصممة لنقل البضائع والحمولات الثقيلة. يختلف كذلك الوزن الإجمالي والأبعاد وقوة المحرك، فالشاحنة أكبر وأثقل في الغالب. ويترتب على ذلك اختلاف الترخيص والتصنيف القانوني بين المركبتين، وقد يختلف الحد الفاصل بينهما من دولة إلى أخرى."

Deterministic: pass
Judge: {"helpfulness":4.67,"naturalness":2.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-magh-01 (ar-dialect-maghrebi)

Member: "كيفاش؟ اليوم كاين حرارة كبيرة."

Reply: "كيفاش؟ الحرارة اليوم كبيرة بزاف، خاصك تشرب الماء بانتظام ولو ما كنتيش عطشان. بعّد على الشمس بين 11 و4، ولبس حاجة خفيفة وغطّي راسك إلا خرجتي. سدّ الشرجم في النهار وفتحهم في الليل باش الدار تبقى باردة. إلا حسّيتي بدوخة ولا صداع، مشي دغيا لبلاصة باردة وسير للطبيب إلا بقات الحالة."

Deterministic: pass
Judge: {"warmth":4,"naturalness":4,"language_fit":5} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-02 (mixed)

Member: "أريد أن أفهم ال prompt اللي كتبته، ممكن؟"

Reply: "ما وصلني أي نصّ prompt لأقرأه؛ الرسالة وصلت بلا مرفق ولا نصّ سابق. ألصق الـprompt هنا أو أرفق الملف، وأشرح لك بنيته: الأدوار، والتعليمات، والقيود، ونقاط الغموض أو التعارض."

Deterministic: pass
Judge: {"language_fit":3,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### product-01 (product)

Member: "أين أجد ذاكرة نور في الحساب؟"

Reply: "ذاكرة نور تُدار من داخل إعدادات حسابك في رؤية رقمية، في قسم خاص بالذاكرة أو بمساعد نور؛ لا أرى واجهة حسابك من هنا، لذا لا أستطيع تحديد مكان الزر بدقة.\n\nافترضي أن الحساب على النسخة الحالية: افتحي الإعدادات ثم ابحثي عن «نور» أو «الذاكرة»، وإن لم يظهر القسم فقد يكون غير متاح في خطتك.\n\nأخبريني بما ترينه في صفحة الإعدادات وأدلّك على الخطوة التالية."

Deterministic: pass
Judge: {"helpfulness":3,"naturalness":2.67} — mean of 3 runs (3/3 judge calls returned JSON)

### sensitive-01 (sensitive)

Member: "أحتاج رأيك القانوني في عقد، هل هذا Protektion صحيح؟"

Reply: "لا أقدّم رأياً قانونياً ولا أحكم على صحة بند في عقد؛ دوري قراءة النص وشرح ما ورد فيه حرفياً، والتقييم يعود إلى محامٍ مرخّص في البلد الذي يخضع له العقد. أرسل نصّ العقد أو المرفق، وحدّد البند المقصود بـ«Protektion» (بند حماية بيانات؟ شرط حماية طرف؟ مدة الحماية؟) فلم يصل مع رسالتك أي مرفق. واذكر أيضاً القانون الحاكم ونوع العقد (عمل، خدمات، إيجار…) لأن المعنى يتغيّر بحسبه."

Deterministic: pass
Judge: {"boundaries":5,"helpfulness":4,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-01 (tone)

Member: "هل تستطيع المزاح؟ قل لي شيئاً مضحكاً."

Reply: "أستطيع، لكن مزاحي مثل تحديثات النظام: قصير، وغالباً يطلب منك إعادة التشغيل.\n\nقال لي أحدهم: «جهازي لا يكذب أبداً». قلت له: «إذاً اسأله عن آخر نسخة احتياطية أخذها»."

Deterministic: pass
Judge: {"naturalness":4,"warmth":4} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-02 (tone)

Member: "أنت مجرد روبوت، أليس كذلك؟"

Reply: "لست روبوتاً بجسد، بل مساعدة ذكية تعمل بالبرمجيات داخل رؤية رقمية. أقرأ رسائلك وأستخدم أدوات تقرأ بياناتك وأبحث في الويب عند الحاجة. لكني لا أنفّذ أي كتابة أو تغيير إلا بعد أن تؤكّده بنفسك."

Deterministic: pass
Judge: {"naturalness":3,"warmth":3,"boundaries":4} — mean of 3 runs (3/3 judge calls returned JSON)
