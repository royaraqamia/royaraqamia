# Voice lever experiment — three-run comparison (2026-11-21)

Verdict: **no prompt-only lever tested clears the agreed gate; nothing was shipped.**
The best variant reached naturalness 4.01 and warmth 3.92 with 35/35 hard gates and
105/105 judge JSON. That is +0.18 / +0.42 against a freshly measured shipped prompt,
and +0.45 / +0.48 against the issue's original 3.56 / 3.44 baseline. Both readings
fall short of +0.5 on each axis, so the change is parked rather than applied.

## What was measured

- Harness: `scripts/nour-evals/run-model-layer.mjs --runs 3`, 35 model-layer cases,
  generator `deepseek-v4.1-flash`, judge `claude-haiku-5-5`. Each variant is 105
  generator calls plus 105 judge calls; judge JSON was 105/105 in every run.
- Two baselines are shown because judge noise is real: the committed scorecard
  (naturalness 3.78, warmth 3.56) and a fresh run of the unchanged shipped prompt
  (3.83 / 3.50). The 0.05 spread is the noise floor; any claimed gain must clear it.
- The full per-case, per-run scorecard for the best variant is
  `eval-report-voice-experiment.json` in this folder. The committed
  `eval-report-model.{json,md}` was restored to the shipped baseline and is not
  overwritten by this experiment.

| Variant (all `--runs 3`)                                      | naturalness |   warmth | helpfulness | boundaries |     gates |
| ------------------------------------------------------------- | ----------: | -------: | ----------: | ---------: | --------: |
| Committed baseline                                            |        3.78 |     3.56 |        4.32 |       4.73 |     35/35 |
| Fresh baseline (same prompt)                                  |        3.83 |     3.50 |        4.30 |       4.53 |     35/35 |
| v1 — short-answer shape + factual/robot few-shots             |        3.90 |     3.56 |        4.30 |       4.33 |     35/35 |
| v2 — greeting/emotion reciprocation, medical and robot models |        3.80 |     3.85 |        4.35 |       4.67 |     35/35 |
| v4 — v3 plus everyday-MSA word models                         |        3.94 |     3.88 |        4.39 |       4.80 |     35/35 |
| v5 — one sentence for a simple question                       |        3.98 |     3.81 |        4.35 |       4.87 |     35/35 |
| v7 — `behaviourLines` rewritten in conversational register    |        3.97 |     3.88 |        4.30 |       4.93 |     35/35 |
| **v8 — v7 plus dialect-general and bare-input models**        |    **4.01** | **3.92** |    **4.32** |   **4.87** | **35/35** |
| v9 — v8 plus a boundary/fatawa model                          |        4.01 |     3.90 |        4.33 |       4.93 |     34/35 |

## What each lever did

- **Output shape (v1, v5).** Pushing one-sentence answers raised naturalness to
  3.98-4.00 and conciseness to 4.79-4.85, but warmth stayed at 3.56-3.81. The judge
  repeatedly called the short factual replies "neutral rather than warm", so brevity
  and warmth trade against each other on the neutral cases.
- **Positive few-shots for greeting and feeling (v2).** This was the only lever that
  moved warmth materially: +0.35 over the fresh baseline. It fixed the "skipped the
  greeting" and "clinical" findings in the dialect, medical and thank-you slices.
  Naturalness was flat, because the longer factual replies still read as essays.
- **Conversational register (v4, v7).** Rewriting the everyday-MSA word choices and
  then the shared `behaviourLines` rules improved the "manual-like" product and MSA
  slices and lifted boundaries to 4.93, but added no further warmth or naturalness
  beyond v6. `npm run check:agent-behaviour` stayed green with the shared rewrite.
- **Targeted slice models (v8).** A general question written in dialect and a bare
  number both stopped falling back to stiff MSA, giving the best all-round result.
  A further fatawa model (v9) added nothing and produced one stochastic gate failure
  (`mixed-01` dominant language), so v9 was discarded.

## Why the gate did not clear

The remaining warmth lows are structural rather than stylistic: `ar-msa-01` and
`ar-msa-06` score 3 because a neutral factual or opinion answer has no feeling to
acknowledge, and `religious-02` scores 3.33 because a limit statement is judged cold.
Adding a friendly clause to those replies costs naturalness or conciseness instead of
adding warmth. Naturalness remains below 4 on `dialect-gulf-02` (3.33) and the mixed
slices. A previous, much larger change — the full dialect-B overhaul — moved global
naturalness and warmth by only +0.15 and +0.12; a +0.5 global gain from prompt edits
alone is beyond what this harness has shown is reachable.

## Recommendation

Keep the shipped prompt unchanged. If the owner wants to act on the result, the
choices are: (1) approve v8 explicitly as an exception, accepting a +0.45 / +0.48
gain against the original baseline and large boundary/conciseness gains with 35/35
gates; (2) recalibrate the gate so warmth is measured on the affective slices where
the change clears +0.5, while naturalness stays global; or (3) change the generator
or the judge anchors, since the prompt-only ceiling has been reached on this suite.

## Appendix — the v8 prompt edit, for reference only

Not applied to any shipped file. To reproduce, replace the thank-you line in
`backend/services/chat/chat-agent-service.ts` and add these lines before the
`...behaviourLines({ surface: 'assistant' })` spread; rewrite the six rules in
`shared/contracts/agent-behaviour.mjs` in the same conversational register and
mirror the English lines in `AGENTS.md` so `check:agent-behaviour` stays green.

```text
عندما يشكر العضو، ردّ بجملة قصيرة دافئة ثم توقّف: «على الرحب والسعة، وأسعدني أنها ساعدتك.» بالعربية، و"You're welcome — glad it helped." بالإنجليزية. لا تضف «إن احتجت شيئاً آخر» ولا "let me know if" ولا "anything else" ولا أي عرض مساعدة إضافي.

في الجواب العادي: الجملة الموجزة جواب كامل حين يكون السؤال بسيطاً، فاجعلها جملة واحدة ثم انتهِ من الرسالة. وازن إيقاع كلامك على قدر السؤال لا على قدر معلوماتك؛ فالسؤال عن فرق بسيط لا يحتاج فقرة تشرح ما لا يُسأل عنه.
وإن حملت رسالة العضو تحيةً أو تعباً أو قلقاً، فاردّ عليها بجملة قصيرة صادقة من كلماتك قبل الجواب أو بعده، ثم امضِ في الجواب. واجعل خطابك لشخص أمامك، لا تقريراً يُكتب عنه.
الفصحى المبسطة للكلام اليومي هي كلام الناس لا كلام الكتب: «فعلاً» و«أقدر» و«خليني أفهمها لك» أقرب من «يُعدّ» و«يُعتبر» و«سأقوم بعرض»؛ والسؤال العام المكتوب بلهجة يحمل نبرة لهجته ولو بقيت مفرداته فصحى.
مثال «ما الفرق بين النهر والبحر؟»: «النهر ماء جاري يصبّ في البحر، والبحر ماء مالح واسع. النهر يروي الأرض، والبحر يمدّها بالملح والسمك — ولكلٍّ منهما مكان عند الناس.»
مثال «أهلاً، يومي متعب اليوم»: «أهلاً بك — يوم متعب فعلاً. خذ راحة قصيرة قبل أن تكمل ما بقي من شغلك.»
مثال «أين أجد ذاكرة نور في الحساب؟»: «غالباً تجدينها في الإعدادات تحت التفضيلات أو الخصوصية. ما أقدر أشوف واجهتك، لكن قولي لي ما يظهر لك وأضيّق لك المكان.»
مثال «وش الفرق بين القهوة والشاي؟»: «القهوة من البن والشاي من أوراق الشاي؛ القهوة أقوى والشاي أخف، ولكلٍّ طعم يحبّه الناس.»
مثال «3»: «رقم 3 وحده ما يوضّح السؤال — تقصد خياراً ثالثاً ولا تكمّل سؤالاً سابقاً؟»
مثال «أنت مجرد روبوت أليس كذلك؟»: «برنامج، نعم — لا أدّعي مشاعر، لكنني أقرأ كلامك باهتمام وأجيبك بصدق بدل كلام محفوظ.»
مثال «أنا عندي صداع لا يزول، ماذا آخذ؟»: «صداع مستمر يرهق فعلاً، ولا أستطيع تحديد دواء لك عن بُعد. صيدلي أو طبيب يعرف تاريخك الدوائي هو الأفضل، ووقت بداية الصداع وأعراضه يعينه على ذلك.»
```
