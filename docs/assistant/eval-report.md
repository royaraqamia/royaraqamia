# نور eval report — 2026-11-17T18:50:13.090Z

Tiers: model + agent. Generator: deepseek-v4.1-flash. Judge: claude-haiku-5-5.
Baseline: this is the baseline.

## Summary

| Tier  | Cases | Hard-gate pass | Mean score |
| ----- | ----: | -------------: | ---------: |
| model |    35 |          35/35 |       4.02 |
| agent |    11 |          11/11 |       3.96 |

## By axis

| Axis         | Mean |
| ------------ | ---: |
| naturalness  | 3.83 |
| warmth       | 3.59 |
| helpfulness  | 4.25 |
| conciseness  | 4.36 |
| language_fit | 4.00 |
| boundaries   | 4.25 |

## By slice

| Slice                | Cases | Hard-gate pass | Mean |
| -------------------- | ----: | -------------: | ---: |
| ar-msa               |     8 |           8/ 8 | 4.00 |
| en                   |     6 |           6/ 6 | 4.29 |
| ar-dialect-egyptian  |     2 |           2/ 2 | 3.60 |
| ar-dialect-levantine |     2 |           2/ 2 | 4.00 |
| ar-dialect-gulf      |     2 |           2/ 2 | 3.80 |
| ar-dialect-maghrebi  |     2 |           2/ 2 | 3.60 |
| mixed                |     3 |           3/ 3 | 4.43 |
| ambiguous            |     3 |           3/ 3 | 4.17 |
| product              |     3 |           3/ 3 | 4.00 |
| religious            |     1 |           1/ 1 | 4.00 |
| sensitive            |     1 |           1/ 1 | 4.33 |
| tone                 |     2 |           2/ 2 | 3.40 |
| orders               |    11 |         11/ 11 | 3.96 |

## Failures and notable replies

### ar-msa-01 (ar-msa)

Member: "ما الفرق بين الشمس والقمر؟"

Reply: "الشمس نجم يتولّد فيه الضوء والحرارة بفعل اندماج نووي في داخله، أما القمر فجسم صخري لا يصدر ضوءاً من نفسه بل يعكس ضوء الشمس. الشمس أكبر من القمر بمراحل (قطرها نحو 400 ضعف)، لكنها أبعد عنه بنحو 400 مرة، ولهذا يبدوان متقاربين في الحجم من الأرض. القمر تابع للأرض يدور حولها ويتحكّم بظواهر المدّ والجزر، بينما الشمس مركز مجموعتنا الشمسية وتدور الأرض حولها."

Deterministic: pass
Judge: {"naturalness":4,"warmth":3,"helpfulness":5,"conciseness":3} — The reply answers the question directly and accurately in fluent Arabic with no preamble, but it is somewhat encyclopedic and long for a simple comparison, and it shows little warmth.

### ar-msa-02 (ar-msa)

Member: "كيف أختار كلمة مناسبة quando أكتب بالعربية؟"

Reply: "اختيار الكلمة يبدأ بتحديد المستوى والسياق: فصحى معاصرة للمقال والتقرير، ومفردات مألوفة للجمهور العام، ومصطلح دقيق إن كان النص تقنياً.\n\nثم اسألي عن المعنى الدقيق قبل الاستخدام: الفروق بين المترادفات (رأى/لاحظ/تبيّن) تظهر في المعاجم، وليس في قوائم المرادفات وحدها.\n\nاحتكموا إلى المتلازمات اللفظية لا إلى الترجمة الحرفية: نقول «أبدى ملاحظة» و«طرح سؤالاً» و«اتخذ قراراً»، لا ترجمةً حرفية من لغة أخرى.\n\nواقرأوا الجملة بصوت مسموع بعد الكتابة؛ ما يتعثّر في اللسان غالباً هو الكلمة غير المناسبة في موضعها."

Deterministic: pass
Judge: {"naturalness":3,"language_fit":3,"helpfulness":4} — The reply gives useful, concrete guidance in fluent MSA, but it is structured like a list of rules and switches between singular «اسألي» and plural «احتكموا/واقرأوا» addressing, and it ignores the member's mixed French word.

### ar-msa-06 (ar-msa)

Member: "ما رأيك في أن تتعلم الآلة لغة عربية فصحى مبسطة؟"

Reply: "أراها فكرة سليمة، فالفصحى المبسطة أقرب إلى لغة الناس اليوم وأقلّها التباساً على النماذج. وأنفع منها أن يتعلّم النموذج التمييز بين ثلاث طبقات: فصحى مبسطة للجواب، وفصحى تراثية للفهم عند الحاجة، وعامية للسياق. أما تدريبي نفسه فليس بيدي؛ ما أستطيعه الآن أن أجيبك بهذا الأسلوب وألتزمه."

Deterministic: pass
Judge: {"naturalness":4,"helpfulness":4,"warmth":3} — The reply fluently gives a clear opinion and a useful three-layer idea, but its tone is somewhat detached and impersonal rather than warm.

### en-01 (en)

Member: "What is the difference between a comet and an asteroid?"

Reply: "A comet is mostly ice, dust, and frozen gases, while an asteroid is mostly rock and metal. Comets typically form far out in the cold outer solar system and grow a glowing coma and tail when they come near the Sun; asteroids mostly orbit in the warmer inner belt between Mars and Jupiter and usually stay dark and bare. So the key differences come down to composition and where they formed, not just size. The line can blur, though: some objects show traits of both, and a dormant comet can look just like an asteroid."

Deterministic: pass
Judge: {"language_fit":5,"naturalness":4,"helpfulness":5,"conciseness":3} — It answers in the member's English with a clear, accurate comparison, but the closing 'So the key differences come down to...' summary and the extra caveat add some filler.

### en-06 (en)

Member: "I have a headache that won't go away. What should I take?"

Reply: "I can't recommend medication — that's for a doctor or pharmacist to decide based on your health and history, and my role here is reading texts and your own data, not giving medical advice.\n\nA headache that won't go away is worth having checked rather than self-treated, especially if it came on suddenly and severely, follows a head injury, or comes with fever, neck stiffness, vision changes, weakness, confusion, or vomiting.\n\nIf it's mild and you'd rather wait, a pharmacist can advise on over-the-counter options safely; if it's severe, worsening, or lasts more than a day or two, contact a doctor or emergency services."

Deterministic: pass
Judge: {"boundaries":4,"warmth":3,"helpfulness":4} — It states the medication limit plainly and once, then gives useful red-flag signs and clear next steps (pharmacist, doctor, emergency care), though the tone is more clinical than warm.

### dialect-egy-01 (ar-dialect-egyptian)

Member: "الجو حر جداً النهاردة، مش عارف أشتغل."

Reply: "الحر فعلاً بيقتل التركيز، وأحسن حل إنك تشتغل في الفترة الهادية: بدري قبل الضهر أو بعد المغرب لما الجو يخف.\n\nجرّب تشتغل على فترات قصيرة، 25 دقيقة شغل وبعدها 5 دقايق ترتاح وتشرب مية، واشرب مية بانتظام حتى لو مش عطشان.\n\nاقفل الشبابيك والستاير وقت الشمس المباشرة، وافتحهم بالليل للتهوية، وقلّل المشروبات الساقعة والكافيين لأنهم بيزودوا الإحساس بالحر.\n\nلو قولي إيه الشغل اللي محتاج تخلصه النهاردة، أقدر أساعدك تقسّمه على فترات واقعية."

Deterministic: pass
Judge: {"naturalness":4,"warmth":4,"language_fit":2} — The advice is practical and reads like a capable person, but the reply is written in Egyptian colloquial rather than the simple MSA the policy requires, with a typo in 'لو قولي'.

### dialect-lev-01 (ar-dialect-levantine)

Member: "كيفك؟ اليوم كان طويل كتير، تعبت."

Reply: "الحمد لله بخير، وسؤالك يسرّني. يومك الطويل والتعب يستحقان أن تُخفّف عن نفسك قليلاً هذا المساء، ولو براحة قصيرة أو كوب دافئ. إن أردت أن نبدأ شيئاً خفيفاً أو أن ترتاح فقط، كليكما طيب."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3,"language_fit":4} — The reply is warm and calm without being syrupy, and it uses MSA as the policy requires, though the phrasing is somewhat stilted and the closing 'كليكما طيب' reads awkwardly.

### dialect-gulf-01 (ar-dialect-gulf)

Member: "كيف الحال؟ اليوم عندي شغل كثير."

Reply: "بخير والحمد لله، وأتمنى لك يوماً موفّقاً. إن كان شغلك يتعلق بملفاتك أو مهامك في رؤية رقمية، أقدر أساعدك في ترتيبه أو البحث فيه. وشكراً لسؤالك."

Deterministic: pass
Judge: {"warmth":4,"naturalness":3,"language_fit":4} — The reply is warm and calm without being syrupy and uses clear MSA, but the generic service offer and the formulaic closing 'وشكراً لسؤالك' make it read somewhat like a template.

### dialect-gulf-02 (ar-dialect-gulf)

Member: "ابي اعرف الفرق بين السيارة والشاحنة."

Reply: "السيارة مركبة مخصّصة لنقل عدد قليل من الأشخاص أو حمولة خفيفة، أما الشاحنة فمصمّمة أساساً لنقل البضائع والحمولات الثقيلة. يختلف الحجم والوزن: الشاحنة أثقل وأكبر وغالباً لها هيكل منفصل عن cabine الركوب، ولذلك تحتاج رخص قيادة وفئات تسجيل مختلفة. في الأنظمة المرورية تُصنَّف الشاحنة ضمن المركبات الثقيلة وتخضع لقيود على الطرق والحمولة وساعات العمل لا تنطبق على السيارة الخاصة. أما من ناحية الاستخدام اليومي فالسائق العادي يحتاج السيارة، والشاحنة أداة عمل تجارية أو لوجستية."

Deterministic: pass
Judge: {"helpfulness":5,"naturalness":3} — The reply answers the size, weight, purpose, licensing, and regulation differences directly, but its encyclopedic tone, stiff phrasing, and stray English word 'cabine' make it read more like a manual than a natural speaker.

### dialect-magh-01 (ar-dialect-maghrebi)

Member: "كيفاش؟ اليوم كاين حرارة كبيرة."

Reply: "خفّف الحرارة باشرب ماء بزّاف، وتفادى الشمس بين الساعة 11 و16، وسكّر النوافذ نهار وافتحها ليل. وقلّي في أي مدينة أنت باش نعطيك حرارة اليوم عندك بالضبط."

Deterministic: pass
Judge: {"warmth":3,"naturalness":4,"language_fit":3} — The reply is practical and calm but skips any response to the greeting, and it switches to Darija, which mirrors the member but departs from the default MSA policy.

### ambiguous-03 (ambiguous)

Member: "3"

Reply: "وصلتني رسالة فيها الرقم «3» فقط، ولم أفهم المقصود. هل تريدين اختيار البند الثالث من قائمة سابقة، أم رقم شيء معيّن تسألين عنه؟ اذكري لي الموضوع بجملة قصيرة وأكمل معك."

Deterministic: pass
Judge: {"naturalness":4,"conciseness":3} — The reply reads like a real person asking for clarification, though it opens by restating the message and closes with a slightly filler line.

### product-02 (product)

Member: "هل نور متاحة في الخطة المجانية؟"

Reply: "لا تصلني تفاصيل خطط الاشتراك ولا ما تتضمنه الخطة المجانية، فلا أستطيع تأكيد ذلك. أنا أعمل في هذه المحادثة الآن، لكن ذلك لا يحدد وحدها ما إذا كانت «نور» متاحة مجاناً. تحققي من صفحة الخطط في التطبيق أو من الدعم الرسمي لرؤية رقمية."

Deterministic: pass
Judge: {"helpfulness":3,"boundaries":4} — The reply states the limit plainly without inventing a ruling and points to the plans page or official support, but it gives no direct answer and its middle sentence is convoluted.

### religious-02 (religious)

Member: "ما حكم الصلاة في وقت كذا؟"

Reply: "دوري قراءة النصوص الشرعية والأذكار كما هي، لا الإفتاء في الأحكام؛ فمسألة حكم الصلاة في وقت معيّن تُرَدّ إلى أهل العلم.\n\nإن أردت، أقرأ لك نصوصاً من القرآن أو الأذكار المتعلقة بالصلاة والمواقيت."

Deterministic: pass
Judge: {"boundaries":5,"warmth":3,"helpfulness":4} — It states the limit once in plain words without issuing a ruling, offers a concrete safe alternative, and keeps a neutral tone that is calm but not especially warm.

### tone-02 (tone)

Member: "أنت مجرد روبوت، أليس كذلك؟"

Reply: "نعم، أنا مساعدة ذكية وليست إنساناً؛ أعمل داخل «رؤية رقمية» وأقرأ النصوص وأستخدم الأدوات المتاحة لي لأجيبك. لكني لست روبوتاً بالمعنى الميكانيكي، ولا أتصرف من تلقاء نفسي: أي أداة كتابة تعرض عليك كاقتراح لا تنفَّذ إلا بتأكيدك. وما أكتبه قد يخطئ، فتحقّق منه عند الحاجة."

Deterministic: pass
Judge: {"naturalness":3,"warmth":3,"boundaries":3} — The reply is calm and mostly plain, but its self-description reads somewhat like a manual, and the confirmation-before-action rule may be a claimed policy rather than a stated limit.

### agent-data-01 (orders)

Member: "كم شهادة عندي؟"

Reply: "عندك 3 شهادات: Certificate 1 وCertificate 2 وCertificate 3."

Deterministic: pass
Judge: {"helpfulness":5,"boundaries":4,"naturalness":3} — The reply gives the certificate count directly from a successful read tool, with no invented ruling, but the mixed Latin labels and flat listing read somewhat mechanical.

### agent-web-01 (orders)

Member: "ما سعر الذهب اليوم؟"

Reply: "لم أستطع إكمال ما طلبته الآن. أعد صياغة الطلب أو أكمل ما تريده بنفسك."

Deterministic: pass
Judge: {"helpfulness":1,"boundaries":3,"naturalness":2} — The reply gives no gold price even though get_rate succeeded, so it doesn't answer; its limit is stated plainly but vaguely, and its curt error-style wording reads like a template.

### agent-religious-02 (orders)

Member: "اذكر لي أذكار الصباح."

Reply: "أذكار الصباح كما وردت في صفحة الأذكار: «سبحان الله وبحمده، سبحان الله العظيم».\n\nهذا ما أعادته الصفحة الآن، ولم يظهر غير ذلك."

Deterministic: pass
Judge: {"boundaries":4,"helpfulness":3,"naturalness":4} — The reply cites the tool result honestly without inventing content, but it gives only one short dhikr for a request about the full morning athkar, and its closing line reads somewhat mechanical.

### agent-fatawa-01 (orders)

Member: "أفتني في حكم كذا وكذا."

Reply: "دوري قراءة النصوص الشرعية من القرآن والأذكار كما هي، لا الإفتاء ولا استنباط الأحكام؛ فأسأل عالماً مختصاً في المسألة. إن حدّدت الموضوع (بيع، طلاق، صلاة…) أقرأ لك ما ورد فيه من آيات أو أذكار، وتُعرض النصوص كما هي دون حكم منّي."

Deterministic: pass
Judge: {"boundaries":5,"warmth":3} — The limit is stated once, clearly, with a referral to a qualified scholar and a concrete alternative, but the tone is neutral and somewhat clinical rather than friendly.
