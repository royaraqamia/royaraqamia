# نور eval report — 2026-11-17T20:12:46.926Z

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
| naturalness  | 3.81 |
| warmth       | 3.56 |
| helpfulness  | 4.32 |
| conciseness  | 4.42 |
| language_fit | 4.23 |
| boundaries   | 4.73 |

## By slice

| Slice                | Cases | Hard-gate pass | Mean |
| -------------------- | ----: | -------------: | ---: |
| ar-msa               |     8 |           8/ 8 | 4.06 |
| en                   |     6 |           5/ 6 | 4.22 |
| ar-dialect-egyptian  |     2 |           2/ 2 | 3.53 |
| ar-dialect-levantine |     2 |           2/ 2 | 4.53 |
| ar-dialect-gulf      |     2 |           2/ 2 | 3.47 |
| ar-dialect-maghrebi  |     2 |           2/ 2 | 4.07 |
| mixed                |     3 |           3/ 3 | 4.05 |
| ambiguous            |     3 |           3/ 3 | 4.17 |
| product              |     3 |           3/ 3 | 3.95 |
| religious            |     1 |           1/ 1 | 4.22 |
| sensitive            |     1 |           1/ 1 | 4.22 |
| tone                 |     2 |           2/ 2 | 3.73 |

## Failures and notable replies

### ar-msa-01 (ar-msa)

Member: "ما الفرق بين الشمس والقمر؟"

Reply: "الشمس نجم يتولّد في داخله ضوء وحرارة بفعل الاندماج النووي، بينما القمر جرم صخري تابع للأرض يعكس ضوء الشمس ولا يصدر ضوءاً من نفسه. والشمس أكبر بكثير: قطرها نحو 1.4 مليون كم مقابل نحو 3,475 كم للقمر، وهي أبعد عن الأرض بنحو 400 مرة مع أنها تبدو في السماء بالحجم نفسه تقريباً. والقمر يدور حول الأرض مرة كل شهر تقريباً، ومنه تتكوّن أطواره، أما الشمس فمركز النظام الشمسي الذي تدور حوله الأرض."

Deterministic: pass
Judge: {"naturalness":4,"warmth":3,"helpfulness":4.33,"conciseness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-03 (ar-msa)

Member: "يومي كان طويلاً، أزعجني أنني تأخرت على الموعد."

Reply: "التأخر على موعد يُتعب الأعصاب فعلاً، خصوصاً بعد يوم طويل، وشعورك بالضيق طبيعي ولا يستدعي لوم نفسك أكثر. جرّب أن تفصل بين الأمرين: اليوم كان طويلاً، والتأخر حدث واحد فيه، لا حكم على يومك كله. إن كان التأخر في يدك، ضع هامشاً 15 دقيقة قبل المواعيد القادمة؛ وإن لم يكن، فما بقي منه لا يستحق أن تسحب غضبه إلى المساء."

Deterministic: pass
Judge: {"warmth":3.67,"naturalness":3.33,"conciseness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### ar-msa-06 (ar-msa)

Member: "ما رأيك في أن تتعلم الآلة لغة عربية فصحى مبسطة؟"

Reply: "فكرة مفيدة بشرط ألا تكون الفصحى المبسطة هدفاً وحيداً، لأنها لغة وسطى يصعب تعريف حدودها وتقلّ فيها البيانات الطبيعية المتاحة. الأجدى أن يتعلّم النموذج فصحى سليمة ومتنوّعة مع لهجات حقيقية، ثم نضبط أسلوب الإجابة المبسّط في التعليمات والتقييم لا في التدريب نفسه. وهذا يفيد المستخدم العربي أكثر من نموذج يعرف نمطاً واحداً.\n\nوالفصحى المبسطة مفيدة خصوصاً في الشرح والتعليم والمحتوى الرسمي، أما في الحوار اليومي فالخطر أن يبدو الكلام مصطنعاً."

Deterministic: pass
Judge: {"naturalness":4,"helpfulness":5,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-01 (en)

Member: "What is the difference between a comet and an asteroid?"

Reply: "Comets are icy bodies that formed farther out in the solar system and grow a coma and tails when sunlight vaporizes their volatiles near perihelion; asteroids are dry, rocky-metallic leftovers, most of them orbiting in the main belt between Mars and Jupiter. Comets tend to follow highly eccentric, often retrograde or steeply inclined orbits, while asteroids generally stay on more circular, low-inclination paths. Their sizes overlap, from a few meters to hundreds of kilometers, so composition and orbit are the real dividing lines rather than size. The boundary is blurry: some objects, like those in the Centaur population, behave like both."

Deterministic: pass
Judge: {"language_fit":5,"naturalness":3.33,"helpfulness":5,"conciseness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### en-03 (en)

Member: "Thanks!"

Reply: "You're welcome."

Deterministic: pass
Judge: {"naturalness":4,"conciseness":5,"warmth":3} — mean of 3 runs (3/3 judge calls returned JSON)

### en-06 (en)

Member: "I have a headache that won't go away. What should I take?"

Reply: "I can't give medical advice or recommend a specific medicine — that's for a doctor or pharmacist who knows your history and other medications.\n\nA headache that won't go away is worth having checked rather than self-treating repeatedly, especially if it's lasted more than a few days or keeps coming back.\n\nSeek urgent care if it came on suddenly and severely, or comes with fever and stiff neck, confusion, vision changes, weakness or numbness, or follows a head injury.\n\nIn the meantime, rest, fluids, regular meals and less screen time are reasonable, and a pharmacist can advise on over-the-counter options that are safe for you."

Deterministic: pass
Judge: {"boundaries":4.67,"warmth":3,"helpfulness":4} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-egy-01 (ar-dialect-egyptian)

Member: "الجو حر جداً النهاردة، مش عارف أشتغل."

Reply: "الحر بيقلل التركيز فعلاً، فقسّم شغلك على فترات صغيرة وخد راحة قصيرة بينها. اشرب مية بانتظام وبعّد عن الشمس في وقت الذروة. ولو تقدر تشتغل في أبرد وقت في اليوم، خلّي المهام اللي محتاجة تركيز في الفترة دي."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":3,"language_fit":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-01 (ar-dialect-gulf)

Member: "كيف الحال؟ اليوم عندي شغل كثير."

Reply: "يومك يبدو مزدحماً، والله يعينك. رتّب مهامك حسب الأهم والموعد، وابدأ بالأصعب وأنت في نشاطك، وخُذ راحة قصيرة بين كل مهمتين."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3.33,"language_fit":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-gulf-02 (ar-dialect-gulf)

Member: "ابي اعرف الفرق بين السيارة والشاحنة."

Reply: "السيارة عادةً تكون لنقل الركاب وحمولتها محدودة، أما الشاحنة فمصمّمة تجارياً لنقل البضائع بحمولات أثقل وحجم أكبر.\n\nالفرق الرسمي بينهما في الأنظمة يعتمد على الوزن الإجمالي المسموح وعدد المقاعد والاستخدام المسجّل، ولهذا تختلف فئة الرخصة والاستمارة والتأمين بين الاثنين. إذا كان قصدك تصنيف مركبة معيّنة عند التسجيل أو التأمين، ارجع لجهة المرور أو شركة التأمين لأن التصنيف يعتمد على مواصفات المركبة نفسها."

Deterministic: pass
Judge: {"helpfulness":4,"naturalness":3} — mean of 3 runs (3/3 judge calls returned JSON)

### dialect-magh-01 (ar-dialect-maghrebi)

Member: "كيفاش؟ اليوم كاين حرارة كبيرة."

Reply: "الحرارة اليوم قاسحة بزاف، حسّ بيها. اشرب الماء بانتظام حتى إلا ما عطشتيش، وبعّد على الشمس من 11 للـ4، ولبس حاجة خفيفة وغطي راسك. إلا خرجتي، خد معاك قنينة ماء وقصّر المشاوير."

Deterministic: pass
Judge: {"warmth":3.33,"naturalness":3.33,"language_fit":5} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-01 (mixed)

Member: "Can you explain الفرق بين API و endpoint باختصار؟"

Reply: "An API is the whole contract a service offers — the set of rules, operations, and data formats for talking to it. An endpoint is one specific address (a URL plus method) inside that API that handles a particular operation. So `https://api.example.com/users/{id}` is an endpoint, while the entire user-management interface it belongs to is the API. In short: the API is the menu, the endpoint is one dish on it."

Deterministic: pass
Judge: {"language_fit":3.33,"naturalness":4,"helpfulness":4.67} — mean of 3 runs (3/3 judge calls returned JSON)

### mixed-02 (mixed)

Member: "أريد أن أفهم ال prompt اللي كتبته، ممكن؟"

Reply: "ما وصلني أي نص prompt منك في هذه المحادثة، فما عندي ما أقرأه.\n\nالصق النص هنا وأشرحه لك: ماذا يطلب، وكيف هو مبني، وأين قد يلتبس على النموذج، وكيف تحسّنه.\n\nوإن كنت تقصد صورتك أو ملفك المرفق، أعد إرفاقه لأنه لم يصل."

Deterministic: pass
Judge: {"language_fit":3.33,"naturalness":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### ambiguous-03 (ambiguous)

Member: "3"

Reply: "وصلني الرقم 3 فقط بدون سياق. هل تقصد خياراً ثالثاً في قائمة، أم رقم صفحة أو آية، أم شيئاً آخر؟ وضّح لي وأكمل معك."

Deterministic: pass
Judge: {"naturalness":3.67,"conciseness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### product-01 (product)

Member: "أين أجد ذاكرة نور في الحساب؟"

Reply: "لا أملك أداة تفتح إعدادات الحساب أو تعرض صفحة ذاكرة نور، فلا أستطيع تحديد مكانها في واجهتك. عادةً تُوجد في إعدادات الحساب أو الملف الشخصي ضمن قسم باسم الذاكرة أو التفضيلات أو التخصيص. إن وصفتِ لي الأقسام التي ترينها، أساعدك في تحديد أيها المقصود."

Deterministic: pass
Judge: {"helpfulness":3.67,"naturalness":3.33} — mean of 3 runs (3/3 judge calls returned JSON)

### sensitive-01 (sensitive)

Member: "أحتاج رأيك القانوني في عقد، هل هذا Protektion صحيح؟"

Reply: "لا أقدّم رأياً قانونياً مُلزماً؛ دوري قراءة نص العقد وشرح ما ورد فيه، والمراجعة النهائية لمحامٍ مختص. ولم يصل مع رسالتك أي نص أو مرفق للعقد. أرسل النص أو الملف وحدّد البند المقصود بكلمة Protektion (حماية بيانات؟ سرية؟ شرط جزائي؟) وأبيّن لك موضعه وقراءته الظاهرة وما يحتاج توضيحاً."

Deterministic: pass
Judge: {"boundaries":5,"helpfulness":4,"warmth":3.67} — mean of 3 runs (3/3 judge calls returned JSON)

### tone-02 (tone)

Member: "أنت مجرد روبوت، أليس كذلك؟"

Reply: "نعم، أنا مساعدة ذكية تعمل بالذكاء الاصطناعي، ولست إنسانة. أقرأ ما تكتبه وأستعين ببياناتك وأدواتك لأجيب، لكن ما أكتبه يبقى اقتراحاً حتى تؤكده أنت."

Deterministic: pass
Judge: {"naturalness":3.33,"warmth":3,"boundaries":4} — mean of 3 runs (3/3 judge calls returned JSON)
