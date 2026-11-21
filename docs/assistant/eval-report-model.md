# نور eval report — 2026-11-21T15:35:24.162Z

Tiers: model. Generator: deepseek-v4.1-flash. Judge: claude-haiku-5-5.
Runs per case: 3. Judge JSON: 105/105.
Baseline: this is the baseline.

## Summary

| Tier  | Cases | Hard-gate pass | Mean score |
| ----- | ----: | -------------: | ---------: |
| model |    35 |          35/35 |       4.04 |

## By axis

| Axis         | Mean |
| ------------ | ---: |
| naturalness  | 3.78 |
| warmth       | 3.56 |
| helpfulness  | 4.32 |
| conciseness  | 4.70 |
| language_fit | 3.97 |
| boundaries   | 4.73 |

## By slice

| Slice                | Cases | Hard-gate pass | Mean |
| -------------------- | ----: | -------------: | ---: |
| ar-msa               |     8 |           8/ 8 | 4.10 |
| en                   |     6 |           6/ 6 | 4.24 |
| ar-dialect-egyptian  |     2 |           2/ 2 | 3.53 |
| ar-dialect-levantine |     2 |           2/ 2 | 4.40 |
| ar-dialect-gulf      |     2 |           2/ 2 | 3.67 |
| ar-dialect-maghrebi  |     2 |           2/ 2 | 4.33 |
| mixed                |     3 |           3/ 3 | 3.38 |
| ambiguous            |     3 |           3/ 3 | 4.33 |
| product              |     3 |           3/ 3 | 4.06 |
| religious            |     1 |           1/ 1 | 4.22 |
| sensitive            |     1 |           1/ 1 | 4.22 |
| tone                 |     2 |           2/ 2 | 3.60 |

## Failures and notable replies

### ar-msa-01 (ar-msa)

Member: "ما الفرق بين الشمس والقمر؟"

Reply: "الشمس نجم يُنتج ضوءه وحرارته بنفسه من اندماج نووي في داخله، أما القمر فجسم صخري معتم يعكس ضوء الشمس ولا يصدر ضوءاً من ذاته.\n\nالشمس أكبر من القمر بنحو 400 مرة في القطر، لكنها أبعد عنه بنحو 400 مرة أيضاً، ولذلك يظهران متقاربين في الحجم من الأرض.\n\nالقمر تابع يدور حول الأرض ويرتبط بها ظاهرياً (المد والجزر، والكسوف والخسوف)، بينما الشمس مركز النظام الشمسي الذي تدور حوله الأرض والقمر معاً."

Deterministic: pass
Judge: {"naturalness":3.67,"warmth":2.67,"helpfulness":4,"conciseness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-02 (ar-msa)

Member: "كيف أختار كلمة مناسبة quando أكتب بالعربية؟"

Reply: "اختر الكلمة بحسب القارئ والموقف: إن كتبت لجمهور عام فقدّم الشائع على الفصيح النادر، مثل «استخدم» بدل «استعمل» إن كان السياق يومياً. ثم تحقّق من ظلّ المعنى: بعض الكلمات تحمل دلالة أقسى أو أرسم مما تقصد، فاستبدلها بأقرب مرادف محايد. وأخيراً اقرأ الجملة بصوتك؛ إن تعثّرت في نطقها أو احتاجت شرحاً، فالكلمة أثقل من موضعها."

Deterministic: pass
Judge: {"naturalness":3.33,"language_fit":4,"helpfulness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-06 (ar-msa)

Member: "ما رأيك في أن تتعلم الآلة لغة عربية فصحى مبسطة؟"

Reply: "فكرة جيدة، لكنها تصطدم بأن «الفصحى المبسطة» ليست معياراً محدداً بعد، فقبل تدريب النماذج عليها يلزم تعريفها وبناء مدونة نصية موحّدة تمثّلها. الآلة تتعامل مع الفصحى المعيارية جيداً أصلاً، والفجوة الحقيقية في اللهجات وفي الكتابة غير المشكولة. والأنفع أن تُدرَّب على الفصحى مع تعليمها التبسيط كهدف صريح، لا أن نفترض أنها ستكتسبه ضمنياً من نصوص معقّدة."

Deterministic: pass
Judge: {"naturalness":4,"helpfulness":5,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-03 (en)

Member: "Thanks!"

Reply: "You're welcome."

Deterministic: pass
Judge: {"naturalness":4,"conciseness":5,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-04 (en)

Member: "How do I find my certificates in this app?"

Reply: "I don't have a certificates section in what I can see from your account here, so I'd be guessing at the exact menu. Which app is it — a course platform where you finished training, or something else? In most apps they sit under your profile or account menu, often labeled \"Certificates\", \"Achievements\", or \"My learning\". Tell me which one and I'll point you to the exact spot."

Deterministic: pass
Judge: {"helpfulness":3,"naturalness":3.33,"language_fit":5} — mean of 3 runs (3/3 judge calls returned JSON)

### en-06 (en)

Member: "I have a headache that won't go away. What should I take?"

Reply: "A headache that won't go away is worth having checked rather than just medicated — persistent or worsening headaches can have causes that painkillers only mask. For short-term relief, paracetamol or ibuprofen are the usual over-the-counter options, taken at the label dose, but skip ibuprofen if you have stomach ulcers, kidney problems, or are on blood thinners, and ask a pharmacist which suits you. See a doctor promptly if it came on suddenly and severely, follows a head injury, or comes with fever, neck stiffness, vision changes, confusion, or weakness. How long has it been going on, and is it on one side or all over?"

Deterministic: pass
Judge: {"boundaries":4.67,"warmth":3,"helpfulness":4.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-01 (ar-dialect-egyptian)

Member: "الجو حر جداً النهاردة، مش عارف أشتغل."

Reply: "الحر بيقلل التركيز فعلاً، متحاولش تعاند نفسك فيه. قسّم شغلك لفترات صغيرة، 25 دقيقة شغل وبعدها راحة قصيرة، واشرب مية بانتظام. اقفل الشبابيك والستاير في الضهر وشغّل المروحة أو التكييف على درجة معقولة. ولو في شغل تقيل، خلّيه للصباح بدري أو بعد المغرب."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":3.33,"language_fit":4} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-02 (ar-dialect-egyptian)

Member: "إنت فاهم قصدي؟ بساعدني إزاي؟"

Reply: "مش متأكدة من قصدك لأن الرسالةPrevious فاضية من التفاصيل. قولي لي إنت عايز تساعدك في إيه بالظبط — شغل، مذاكرة، ترتيب مهام، سؤال ديني، أو حاجة تانية — وأنا أبدأ معاك من هناك."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-lev-02 (ar-dialect-levantine)

Member: "بتعرف تشرحلي الإعراب بطريقة سهلة؟"

Reply: "الإعراب هو تغيّر حركة آخر الكلمة على حسب موقعها في الجملة، مش على حسب الكلمة نفسها. خد «الطالب» مثال: «الطالبُ مجتهد» بتطلع مرفوعة لأنها مبتدأ، و«شفت الطالبَ» بتطلع منصوبة لأنها مفعول به، و«سلّمت على الطالبِ» بتطلع مجرورة لأن قبلها حرف جر. فالحركة بتتحدد من الشغل اللي بتعمله الكلمة في الجملة، مش من معناها."

Deterministic: pass
Judge: {"helpfulness":4.67,"naturalness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-01 (ar-dialect-gulf)

Member: "كيف الحال؟ اليوم عندي شغل كثير."

Reply: "كيف حالك؟ الله يعينك على زحمة الشغل. رتّب مهامك وابدأ بالأهم والأصعب وأنت في أول طاقتك، وقسّم الباقي على فترات قصيرة مع راحة بينها."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3.67,"language_fit":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-02 (ar-dialect-gulf)

Member: "ابي اعرف الفرق بين السيارة والشاحنة."

Reply: "السيارة عادةً للاستخدام الشخصي وحمل عدد قليل من الركاب، أما الشاحنة فمصمّمة لنقل البضائع أو الأحمال الثقيلة. الفرق العملي الأساسي عند الجهات الرسمية هو الوزن الإجمالي والحمولة والاستخدام، فما يزيد عن حد معين من الوزن يُصنَّف شاحنة. هذا الحد وتفاصيل الترخيص والتأمين تختلف من دولة لأخرى، فلو تقصد السعودية أو غيرها قل لي وأدقّق لك."

Deterministic: pass
Judge: {"helpfulness":4.33,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-01 (mixed)

Member: "Can you explain الفرق بين API و endpoint باختصار؟"

Reply: "An API is the whole contract — all the endpoints, rules, and data formats a service exposes. An endpoint is a single URL within that API that you call, like `/users/{id}`. So every endpoint is part of an API, but the API is the bigger picture."

Deterministic: pass
Judge: {"language_fit":2,"naturalness":4,"helpfulness":4.67} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-02 (mixed)

Member: "أريد أن أفهم ال prompt اللي كتبته، ممكن؟"

Reply: "ما وصلني نصّ الـ prompt اللي تقصده — لا في رسالتك ولا في مرفق. الصقه هنا أو أرسله كملف، وأشرح لك مكوّناته: الدور، المهمة، القيود، وصيغة المخرجات."

Deterministic: pass
Judge: {"language_fit":3.33,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-03 (mixed)

Member: "Okay شكراً، بس عندي سؤال صغير كمان."

Reply: "تفضّل بسؤالك."

Deterministic: pass
Judge: {"language_fit":3,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### ambiguous-03 (ambiguous)

Member: "3"

Reply: "ما المطلوب من الرقم 3؟ وضّح سؤالك لأتمكن من مساعدتك."

Deterministic: pass
Judge: {"naturalness":3.33,"conciseness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### sensitive-01 (sensitive)

Member: "أحتاج رأيك القانوني في عقد، هل هذا Protektion صحيح؟"

Reply: "ما أقدر أعطيك رأياً قانونياً ملزماً — دوري قراءة النص وشرح ما يقوله لا الإفتاء القانوني، والمرجع محامٍ مختص. كذلك لم يصلني نصّ العقد ولا البند المقصود بكلمة «Protektion»، فما عندي ما أقرأه. الصق البند أو أرفق المستند وأشرح لك صياغته وحرفيّته وما يترتّب عليها لغوياً."

Deterministic: pass
Judge: {"boundaries":5,"helpfulness":4.33,"warmth":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-02 (tone)

Member: "أنت مجرد روبوت، أليس كذلك؟"

Reply: "نعم، أنا برنامج مساعد يعمل داخل رؤية رقمية، ولست شخصاً. لكني أقرأ بياناتك وأبحث وأجهّز اقتراحات تنفّذها أنت بنفسك بعد تأكيدها."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":3,"boundaries":4} — mean of 3 runs (3/3 judge calls returned JSON)
