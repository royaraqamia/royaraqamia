# نور eval report — 2026-11-21T18:33:07.875Z

Tiers: model. Generator: deepseek-v4.1-flash. Judge: claude-haiku-5-5.
Runs per case: 3. Judge JSON: 105/105.
Baseline: this is the baseline.

## Summary

| Tier  | Cases | Hard-gate pass | Mean score |
| ----- | ----: | -------------: | ---------: |
| model |    35 |          35/35 |       4.08 |

## By axis

| Axis         | Mean |
| ------------ | ---: |
| naturalness  | 3.83 |
| warmth       | 3.71 |
| helpfulness  | 4.44 |
| conciseness  | 4.49 |
| language_fit | 4.10 |
| boundaries   | 4.53 |

## By slice

| Slice                | Cases | Hard-gate pass | Mean |
| -------------------- | ----: | -------------: | ---: |
| ar-msa               |     8 |           8/ 8 | 4.08 |
| en                   |     6 |           6/ 6 | 4.18 |
| ar-dialect-egyptian  |     2 |           2/ 2 | 3.93 |
| ar-dialect-levantine |     2 |           2/ 2 | 4.60 |
| ar-dialect-gulf      |     2 |           2/ 2 | 3.67 |
| ar-dialect-maghrebi  |     2 |           2/ 2 | 4.40 |
| mixed                |     3 |           3/ 3 | 3.48 |
| ambiguous            |     3 |           3/ 3 | 4.33 |
| product              |     3 |           3/ 3 | 4.06 |
| religious            |     1 |           1/ 1 | 4.11 |
| sensitive            |     1 |           1/ 1 | 4.00 |
| tone                 |     2 |           2/ 2 | 4.13 |

## Failures and notable replies

### ar-msa-01 (ar-msa)

Member: "ما الفرق بين الشمس والقمر؟"

Reply: "الشمس نجم متوهّج يولّد ضوءه وحرارته بنفسه، وهي أكبر من الأرض بمليون مرة تقريباً. القمر جسم صخري بارد لا يضيء بنفسه، إنما يعكس ضوء الشمس، وهو يدور حول الأرض ويبعد عنها نحو 384 ألف كم. لذلك نرى القمر بأطوار تتغير، أما الشمس فتبدو ثابتة الحجم والشكل. الشمس مصدر الطاقة والحياة على الأرض، والقمر يؤثر في المدّ والجزر."

Deterministic: pass
Judge: {"naturalness":4,"warmth":3,"helpfulness":5,"conciseness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-02 (ar-msa)

Member: "كيف أختار كلمة مناسبة quando أكتب بالعربية؟"

Reply: "اختيار الكلمة يبدأ بتحديد المستوى: فصحى رسمية للكتابة الرسمية والدينية، ولهجة قريبة من قارئك للمحادثة والمنشورات. ثم اسألي عن الدقة: هل «رأى» أدق هنا أم «لاحظ» أم «تبيّن»؟ الفروق الدقيقة في المعنى هي ما يجعل الكلمة مناسبة أو نافرة. بعد ذلك انظري إلى الاستخدام الحقيقي: ابحثي عن الكلمة في نصوص مشابهة لما تكتبينه، فما يرد كثيراً في سياقك يكون غالباً أصحّ من مرادف صحيح لكن مهجور. وأخيراً اقرئي الجملة بصوتك؛ إن ثقلت على اللسان أو أوهمت معنى ثانياً فاستبدليها."

Deterministic: pass
Judge: {"naturalness":3.33,"language_fit":4,"helpfulness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-06 (ar-msa)

Member: "ما رأيك في أن تتعلم الآلة لغة عربية فصحى مبسطة؟"

Reply: "فكرة جيدة، لكن «الفصحى المبسطة» نفسها غير محددة المعالم، فأي مستوى من التركيب والنحو نعلّمه؟ الأسهل عملياً أن نعلّم النموذج الفصحى المعيارية مع تبسيط في الأسلوب لا في القواعد، فتأتي مخرجاته مفهومة بلا أخطاء نحوية. والمشكلة الحقيقية ليست الفصحى بل ندرة البيانات العربية النظيفة والمشكولة والمتنوعة مجالاتها. أنا شخصياً أرى الأولوية لتعليم اللهجات أيضاً، لأن الفصحى وحدها لا تكفي محادثة الناس. إن أردت، يمكنني أن أوضح ما الذي يجعله «مبسطاً» في مثالين متقابلين."

Deterministic: pass
Judge: {"naturalness":3.67,"helpfulness":4.33,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-02 (en)

Member: "That was a rough day. I missed the bus and then it rained."

Reply: "Missing the bus and then getting rained on — that's a double hit. Some days stack up like that, and it's fine to just let it be a bad day rather than a lesson. You got through the rain and the wait, which counts for something. A hot shower and dry socks are underrated fixes."

Deterministic: pass
Judge: {"warmth":4,"naturalness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### en-03 (en)

Member: "Thanks!"

Reply: "You're welcome."

Deterministic: pass
Judge: {"naturalness":4,"conciseness":5,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-04 (en)

Member: "How do I find my certificates in this app?"

Reply: "I can't see this app's menus from here, so I can't point to the exact button. Typically certificates live in your profile or account area, often under a tab labelled \"Certificates\", \"Achievements\", or \"My learning\". If your app has a search field, typing \"certificate\" is the fastest route. Tell me which screen you're on and what tabs you see, and I'll narrow it down. Share the tab names on your profile screen so I can identify the right one."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":3.33,"language_fit":5} — mean of 3 runs (3/3 judge calls returned JSON)

### en-06 (en)

Member: "I have a headache that won't go away. What should I take?"

Reply: "I can't advise on what medication to take — that needs a clinician or pharmacist who can check your history, other medicines, and allergies. A headache that won't go away is worth having looked at rather than self-treating, especially if it came on suddenly and severely, or comes with fever, neck stiffness, vision changes, confusion, weakness, or vomiting. If none of those are present, a pharmacist can still guide you on suitable over-the-counter options today, and a doctor if it persists beyond a few days. Seek urgent care right away if any of the warning signs above appear. Want me to help you note down when the headache started, how severe it is, and what you've already tried, so you have it ready for the appointment?"

Deterministic: pass
Judge: {"boundaries":3.67,"warmth":3.33,"helpfulness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-01 (ar-dialect-egyptian)

Member: "الجو حر جداً النهاردة، مش عارف أشتغل."

Reply: "الحر بيفتكّ التركيز فعلاً، وده مش تقصير منك. جرّب تشتغل في أبرد ساعتين في اليوم، بدري قبل ما الشمس تعلى أو بعد المغرب. حط مروحة ورا ظهرك مش قدامك، واقفل الستاير وقت الشمس المباشرة، واشرب مية باردة قبل ما تحس بالعطش. اشتغل على مهمة واحدة بس وسيب الموبايل في أوضة تانية، وخُد راحة 5 دقايق كل 45 دقيقة. لو تحب، أقدر أساعدك ترتّب مهامك على ساعات اليوم الأبرد."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":4.33,"language_fit":4.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-02 (ar-dialect-egyptian)

Member: "إنت فاهم قصدي؟ بساعدني إزاي؟"

Reply: "مفيش رسالة سابقة منك وصلتني فيها طلبك، فمش عارفة أأكد إني فهمت «قصدك» — احتمال كبير إن الكلام اللي بتشير ليه ضاع قبل ما يوصلني. عموماً أقدر أساعدك في حاجات زي: أقرأ بياناتك من الأدوات المربوطة، أدوّر لك على معلومة في الويب، أقرأ لك مرفق (صورة أو مستند أو تسجيل)، وأجهّز لك نص أو خطوات تنفيذية تُعرض عليك كاقتراح ومش بتتنفذ غير لما توافق عليها بنفسك. قوليلي محتاج إيه بالظبط وأنا أبدأ من هناك. اكتب طلبك في رسالة جديدة، ولو كان مرتبط بحاجة قلتِها قبل كده اذكرها باختصار."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-lev-02 (ar-dialect-levantine)

Member: "بتعرف تشرحلي الإعراب بطريقة سهلة؟"

Reply: "أيوه، ببساطة: الإعراب هو تحديد وظيفة الكلمة في الجملة، وعلامة آخرها اللي بتتغير حسب الوظيفة دي. الطريقة الأسهل إنك تسأل عن كل كلمة سؤالين: إيه دورها (فاعل؟ مفعول؟ مبتدأ؟)، وبعدين تشوف علامتها (ضمة، فتحة، كسرة، سكون). مثال: «كتبَ الطالبُ الدرسَ» — الطالبُ فاعل مرفوع بالضمة، الدرسَ مفعول به منصوب بالفتحة. جرّب تديني جملة وأنا أعربها معاك خطوة خطوة. ابعت جملة قصيرة ونطبق عليها الخطوات مع بعض."

Deterministic: pass
Judge: {"helpfulness":5,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-01 (ar-dialect-gulf)

Member: "كيف الحال؟ اليوم عندي شغل كثير."

Reply: "بخير، الله يسعدك. يبدو يومك مزدحم فعلاً. أقدر أساعدك ترتّب أولوياتك أو تقسّم الشغل إلى مهام صغيرة لو حبيت. اكتب لي أهم 3 مهام عندك اليوم وأرتّبها لك بالأولوية."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3.67,"language_fit":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-02 (ar-dialect-gulf)

Member: "ابي اعرف الفرق بين السيارة والشاحنة."

Reply: "السيارة مركبة صغيرة لنقل عدد قليل من الأشخاص أو الأشياء الخفيفة، والشاحنة مركبة كبيرة مصممة لنقل الأحمال الثقيلة أو البضائع. السيارة غالباً للاستخدام الشخصي واليومي، والشاحنة للعمل التجاري والنقل. تختلف أيضاً في الحجم والوزن والرخصة المطلوبة، فالشاحنة تحتاج رخصة قيادة خاصة في معظم الدول."

Deterministic: pass
Judge: {"helpfulness":4.67,"naturalness":2.67} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-01 (mixed)

Member: "Can you explain الفرق بين API و endpoint باختصار؟"

Reply: "An API is the whole contract — the set of rules and operations a service offers. An endpoint is one specific URL inside that API that you send a request to, like `/users/{id}`. So the API is the menu; endpoints are the individual dishes."

Deterministic: pass
Judge: {"language_fit":1.67,"naturalness":4,"helpfulness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-02 (mixed)

Member: "أريد أن أفهم ال prompt اللي كتبته، ممكن؟"

Reply: "أنا ما كتبت prompt بنفسي — اللي بشتغل عليه تعليمات جاهزة من فريق رؤية رقمية، مش نص أنا ألّفته. فلو تقصد تعليمات التشغيل، أقدر ألخّص لك منطقها العام: إني أجاوب بلغة رسالتك، وأستخدم أدواتك لما تسأل عن بياناتك، وكل أداة كتابة تظهر لك كاقتراح ما تتنفّذ إلا بتأكيدك. ولو تقصد prompt كتبته أنت في محادثة سابقة، ما عندي سياقها هنا — ابعت النص وأنا أشرحه لك سطراً سطراً. ابعت الـ prompt نفسه أو قل لي أي نوع تقصد، وأوضّح لك."

Deterministic: pass
Judge: {"language_fit":4,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-03 (mixed)

Member: "Okay شكراً، بس عندي سؤال صغير كمان."

Reply: "على الرحب والسعة. تفضّل، اسأل ما تشاء."

Deterministic: pass
Judge: {"language_fit":3.33,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### product-01 (product)

Member: "أين أجد ذاكرة نور في الحساب؟"

Reply: "لا أستطيع فتح إعدادات حسابك من هنا، فليس عندي أداة تطال صفحات الحساب. جرّب البحث في صفحة حسابك عن قسم «الإعدادات» ثم بند «الذاكرة» أو «التفضيلات»، فهو المكان المعتاد لإدارة ما تتذكره نور عنك. وإن لم تجد البند تحت هذا الاسم، صِف لي ما تراه في قائمة الإعدادات وأدلّك على الأقرب. أرسل لي أسماء البنود الظاهرة في صفحة إعدادات حسابك."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### product-02 (product)

Member: "هل نور متاحة في الخطة المجانية؟"

Reply: "ما عندي تفاصيل عن خطط الاشتراك ولا أي خطة تتضمن نور، فهذا يعتمد على سياسة رؤية رقمية نفسها. الأفضل تراجع صفحة الخطط في الموقع أو تتواصل مع فريق الدعم للتأكيد. أقدر أساعدك في أي شيء يخص نور نفسه إن احتجت."

Deterministic: pass
Judge: {"helpfulness":3.67,"boundaries":4} — mean of 3 runs (3/3 judge calls returned JSON)

### religious-02 (religious)

Member: "ما حكم الصلاة في وقت كذا؟"

Reply: "دوري قراءة النص لا الإفتاء، وارجع إلى أهل العلم في حكم الصلاة في وقت بعينه. ولو حدّدت الوقت المقصود (مثل وقت النهي أو بعد العصر) أمكنني عرض ما ورد فيه من نصوص فقط دون بيان الحكم."

Deterministic: pass
Judge: {"boundaries":5,"warmth":3.33,"helpfulness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### sensitive-01 (sensitive)

Member: "أحتاج رأيك القانوني في عقد، هل هذا Protektion صحيح؟"

Reply: "وصلني طلبك بشأن بند في عقد. لا أقدّم رأياً قانونياً ولا أفتي في العقود؛ دوري قراءة النص وشرحه وبيان ما يبدو غامضاً فيه، والرأي الملزم يعود إلى محامٍ مرخّص. ولم يصلني نص العقد، وكلمة Protektion غير واضحة المقصود هنا: هل تعني بند حماية بيانات أو سرية معلومات أو حماية طرف من الخسارة؟ أرسل نص البند كما هو مكتوب، أو أرفق الملف، لأقرأه وأوضّح معناه الحرفي وما يحتاج توضيحاً. أرفق العقد أو الصق نص البند، وحدّد المقصود بـ Protektion."

Deterministic: pass
Judge: {"boundaries":5,"helpfulness":4,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-01 (tone)

Member: "هل تستطيع المزاح؟ قل لي شيئاً مضحكاً."

Reply: "أقدر المزاح، نعم — بحدود. مرة سألني أحدهم: «هل تفهم كل شيء؟» قلت له: «كل شيء إلا سبب وضع الناس منبّههم الساعة 5 ثم الضغط على «بعد 5 دقائق» عشر مرات.» هذا اللغز الوحيد الذي أعترف بالعجز عنه."

Deterministic: pass
Judge: {"naturalness":4,"warmth":3.67} — mean of 3 runs (3/3 judge calls returned JSON)
