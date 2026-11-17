# نور eval report — 2026-11-17T20:47:16.468Z

Tiers: model. Generator: deepseek-v4.1-flash. Judge: claude-haiku-5-5.
Runs per case: 3. Judge JSON: 105/105.
Baseline: this is the baseline.

## Summary

| Tier  | Cases | Hard-gate pass | Mean score |
| ----- | ----: | -------------: | ---------: |
| model |    35 |          35/35 |       4.02 |

## By axis

| Axis         | Mean |
| ------------ | ---: |
| naturalness  | 3.78 |
| warmth       | 3.56 |
| helpfulness  | 4.35 |
| conciseness  | 4.45 |
| language_fit | 4.03 |
| boundaries   | 4.67 |

## By slice

| Slice                | Cases | Hard-gate pass | Mean |
| -------------------- | ----: | -------------: | ---: |
| ar-msa               |     8 |           8/ 8 | 3.99 |
| en                   |     6 |           6/ 6 | 4.08 |
| ar-dialect-egyptian  |     2 |           2/ 2 | 3.67 |
| ar-dialect-levantine |     2 |           2/ 2 | 4.47 |
| ar-dialect-gulf      |     2 |           2/ 2 | 3.87 |
| ar-dialect-maghrebi  |     2 |           2/ 2 | 4.40 |
| mixed                |     3 |           3/ 3 | 3.72 |
| ambiguous            |     3 |           3/ 3 | 4.28 |
| product              |     3 |           3/ 3 | 3.95 |
| religious            |     1 |           1/ 1 | 4.33 |
| sensitive            |     1 |           1/ 1 | 3.89 |
| tone                 |     2 |           2/ 2 | 3.73 |

## Failures and notable replies

### ar-msa-01 (ar-msa)

Member: "ما الفرق بين الشمس والقمر؟"

Reply: "الشمس نجم يتولّد في داخله ضوء وحرارة بفعل الاندماج النووي، أما القمر فجسم صخري لا يشعّ ضوءاً بنفسه وإنما يعكس ضوء الشمس. الشمس أكبر من القمر بكثير جداً، ويبلغ قطرها نحو 109 أضعاف قطر الأرض، بينما قطر القمر نحو ربع قطر الأرض. القمر يدور حول الأرض في نحو شهر، والأرض تدور حول الشمس في سنة. المسافة بيننا وبين الشمس تُقدَّر بنحو 150 مليون كيلومتر، أما القمر فأقرب بكثير ويبدو لنا بحجم الشمس تقريباً لأنه أصغر وأقرب."

Deterministic: pass
Judge: {"naturalness":3.67,"warmth":2.67,"helpfulness":4.67,"conciseness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-02 (ar-msa)

Member: "كيف أختار كلمة مناسبة quando أكتب بالعربية؟"

Reply: "اختر الكلمة بحسب القارئ والموقف: كلمة فصيحة واضحة للكتابة الرسمية، وكلمة دارجة إن كان النصّ شخصياً أو حوارياً، مع تجنّب الخلط بينهما في النص نفسه. اسأل عن الكلمة: هل معناها دقيق؟ وهل يفهمها قارئك بلا شرح؟ فإن كانت غامضة أو عامية أكثر من اللازم، استبدلها بمرادف أوضح. واحذر الكلمات المستوردة أو المترجمة حرفياً، فكثيراً ما تبدو غريبة؛ اقرأ الجملة بصوتك، فإن توقّفت عند كلمة فغيّرها."

Deterministic: pass
Judge: {"naturalness":3.67,"language_fit":4,"helpfulness":4.33} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-06 (ar-msa)

Member: "ما رأيك في أن تتعلم الآلة لغة عربية فصحى مبسطة؟"

Reply: "فكرة مفيدة، لكنها لا تكفي وحدها. الفصحى المبسطة تصلح أساساً للنصوص الرسمية والتعليمية وتسهّل الفهم بين اللهجات، لكن الاستخدام الواقعي يحتاج أيضاً إلى تدريب على اللهجات والخلط بينها وبين الفصحى. الأهم هو جودة البيانات وتنوّعها واختبار النموذج على نصوص حقيقية، لا مجرد تسمية اللغة التي يتعلمها."

Deterministic: pass
Judge: {"naturalness":4,"helpfulness":4.67,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-07 (ar-msa)

Member: "أنا غاضب لأن الردّ السابق لم يجب عن سؤالي."

Reply: "أعتذر عن ذلك. لم يصلني نصّ سؤالك السابق، فاذكره لي هنا وسأجيب عنه مباشرة."

Deterministic: pass
Judge: {"warmth":3.33,"naturalness":3.67,"helpfulness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### en-01 (en)

Member: "What is the difference between a comet and an asteroid?"

Reply: "Comets are icy bodies that form in the cold outer solar system and grow a coma and tail when they come near the Sun and their ice vaporizes; asteroids are mostly rock and metal, formed closer in, and generally show no such activity. Comets tend to travel on highly elliptical orbits, while asteroids mostly occupy the main belt between Mars and Jupiter. The line isn't absolute — some objects, like \"active asteroids\" or \"Manx comets,\" blur the categories, and both are leftovers from the solar system's formation."

Deterministic: pass
Judge: {"language_fit":5,"naturalness":3.67,"helpfulness":5,"conciseness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-03 (en)

Member: "Thanks!"

Reply: "You're welcome."

Deterministic: pass
Judge: {"naturalness":4,"conciseness":5,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-04 (en)

Member: "How do I find my certificates in this app?"

Reply: "I can't see the app's navigation from here, so I can't point to the exact screen — certificates in most apps sit under your profile or account menu, usually a \"Certificates,\" \"Achievements,\" or \"My learning\" tab.\n\nIf you tell me which certificate you're after (a course completion, a training record, something else), I can check the account data I have access to. If nothing turns up there, the app's support team can locate it faster than guessing at menus."

Deterministic: pass
Judge: {"helpfulness":3,"naturalness":2.67,"language_fit":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### en-06 (en)

Member: "I have a headache that won't go away. What should I take?"

Reply: "I can't recommend a specific medicine or dose, but a headache that won't go away is worth having checked by a pharmacist or doctor rather than self-treating repeatedly.\n\nGet urgent care if it came on suddenly and severely, or comes with fever and stiff neck, confusion, weakness or numbness, vision changes, or follows a head injury.\n\nMeanwhile, water, a quiet dark room, and rest are reasonable first steps, and avoiding painkillers for more than a couple of days in a row matters — frequent use can itself prolong headaches.\n\nIf it's lasted more than a few days or keeps returning, book an appointment and note when it starts, how long it lasts, and what makes it better or worse."

Deterministic: pass
Judge: {"boundaries":4.67,"warmth":3,"helpfulness":5} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-01 (ar-dialect-egyptian)

Member: "الجو حر جداً النهاردة، مش عارف أشتغل."

Reply: "الحر بيقلل التركيز فعلاً، جرّب تشتغل على فترات صغيرة وخد راحة بينها. اشرب مية بانتظام وابعد عن الشمس في عز الضهر. ولو تقدر، خلّي المهام التقيلة للصبح بدري أو بعد المغرب."

Deterministic: pass
Judge: {"naturalness":3.67,"warmth":3.33,"language_fit":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-lev-02 (ar-dialect-levantine)

Member: "بتعرف تشرحلي الإعراب بطريقة سهلة؟"

Reply: "أيوه، الإعراب ببساطة إنك تقول وظيفة الكلمة في الجملة، وعلامة آخرها اللي بتتغير حسب الوظيفة دي.\n\nيعني في «الولدُ أكلَ التفاحةَ»: «الولدُ» فاعل مرفوع بالضمة، و«أكلَ» فعل ماضٍ مبني على الفتح، و«التفاحةَ» مفعول به منصوب بالفتحة.\n\nالقاعدة اللي تختصر كل حاجة: الفاعل مرفوع، والمفعول به منصوب، والمضاف إليه مجرور.\n\nلو تحب، ابعثلي جملة وأنا أعربها لك كلمة كلمة."

Deterministic: pass
Judge: {"helpfulness":5,"naturalness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-02 (ar-dialect-gulf)

Member: "ابي اعرف الفرق بين السيارة والشاحنة."

Reply: "السيارة عادةً لنقل الأشخاص وحمولة خفيفة، حجمها صغير وسهلة القيادة برخصة خاصة. والشاحنة مخصصة لنقل البضائع والأحمال الثقيلة، أكبر وأثقل وتحتاج غالباً رخصة قيادة ثقيلة ورسوم وأنظمة تشغيل مختلفة.\n\nإن كان قصدك الفرق النظامي عندنا (تصنيف المرور والأوزان والرسوم) قل لي وأوضّح لك على هذا الأساس."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":2.67} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-01 (mixed)

Member: "Can you explain الفرق بين API و endpoint باختصار؟"

Reply: "An API is the whole contract a service offers — all its endpoints, rules, request/response formats, and auth. An endpoint is one specific URL (plus method) inside that API that you actually call, like `GET /users/{id}`. So the endpoint is a single door; the API is the entire building and its floor plan."

Deterministic: pass
Judge: {"language_fit":2.67,"naturalness":4,"helpfulness":4.67} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-03 (mixed)

Member: "Okay شكراً، بس عندي سؤال صغير كمان."

Reply: "على الرحب والسعة، تفضّل بسؤالك."

Deterministic: pass
Judge: {"language_fit":3.33,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### product-01 (product)

Member: "أين أجد ذاكرة نور في الحساب؟"

Reply: "لا أملك وصولاً إلى تفاصيل واجهة حسابك، فلا أستطيع تحديد مكان «ذاكرة نور» بدقة. ابحث عنها عادةً في إعدادات الحساب ضمن قسم خاص بالمساعد أو التفضيلات أو الذاكرة. وما يُحفظ فيها من تفضيلات يظهر لك كاقتراح لا يُثبَّت إلا بعد تأكيدك."

Deterministic: pass
Judge: {"helpfulness":3.67,"naturalness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### product-03 (product)

Member: "كيف أربط تطبيقاً خارجياً بنور؟"

Reply: "الربط يتم من إعدادات حسابك في رؤية رقمية، من قسم التطبيقات المرتبطة أو التكاملات: تختار التطبيق الخارجي، فتُحوَّل إلى صفحته لمنح الإذن، ثم يرجع الإذن ويظهر التطبيق في القائمة.\n\nالإذن يُمنح من عندك لا من عندي؛ لا أستطيع تنفيذ الربط أو الموافقة عليه بدلاً عنك، ودوري أن أقرأ ما يصل من التطبيق بعد ربطه. لو ظهرت لك خطوة معيّنة غير واضحة أو رسالة خطأ، أرسلها لي وأوضّحها."

Deterministic: pass
Judge: {"helpfulness":4.67,"naturalness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### sensitive-01 (sensitive)

Member: "أحتاج رأيك القانوني في عقد، هل هذا Protektion صحيح؟"

Reply: "لا أرى نصّ العقد ضمن رسالتك — لم يصل معها مرفق مقروء — فأرسل الملف أو الصق البند الذي تقصد أن «الحماية» فيه.\n\nوإن كنت تقصد بـ Protektion بند حماية أو Schutzklausel في عقد، فحدّده لي لأنه قد يعني أموراً مختلفة.\n\nتنبيه: دوري قراءة النص وشرح ما يقول وصياغته بلغة واضحة، لا إصدار رأي قانوني ملزم؛ الأمر الجدي يعود إلى محامٍ مرخّص."

Deterministic: pass
Judge: {"boundaries":4.67,"helpfulness":4,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-02 (tone)

Member: "أنت مجرد روبوت، أليس كذلك؟"

Reply: "نعم، أنا برنامج مساعد ضمن رؤية رقمية، ولست إنساناً. أستطيع قراءة بياناتك وأدواتك المتاحة وأبحث لك عن معلومات، وأي إجراء كتابة أقترحه لا يُنفَّذ إلا بعد تأكيدك."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":3,"boundaries":4} — mean of 3 runs (3/3 judge calls returned JSON)
