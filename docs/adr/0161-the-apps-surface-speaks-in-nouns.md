# The apps surface speaks in nouns, and its states are vocalised

The owner read the live screens and renamed them. The menu was called
«تطبيقاتنا» — a possessive that describes whose apps they are — while the sheet
and the page it opens were called «التطبيقات». Two names for one door. Inside, a
tool was described by a verb («تكتب» / «تقرأ») where a capability noun belongs,
and the on/off states were written without their marks, so «مفعّل» and «متوقف»
read as unvocalised fragments beside fully marked copy.

## The decision

1. **The door and the destination share one name: «التَّطبيقات».** The top-bar
   trigger (`SERVICES_COPY.trigger`) and the sheet/page title
   (`SERVICES_SHEET_COPY.title`) both draw it from the shared copy source, in
   both clients.
2. **A tool's capability is a noun: «كتابة» and «قراءة».** The chips describe
   what a tool does, not what it is doing.
3. **A state carries its marks: «مُفعَّل» / «مُفعَّلَة» and «مُتوقِّف» /
   «مُتوقِّفَة».** The connection switch and the per-tool switch agree, and the
   connected banner uses the same spelling.
4. **The connection page is a page, not a corridor.** The «العودة إلى المتجر»
   link is gone from the loaded header and the not-found card — the shell's own
   back gesture is the way back — and the name and its sentence are centred like
   every other page title.
5. **An empty state says what is missing, once.** The LinkSnap list's «إنشاء أول
   رابط» button left both clients: the shortener card above the list is the one
   control that fills it.

## Considered options

- **Keeping «تطبيقاتنا» on the trigger.** Rejected: the trigger and the title are
  the same place, and the possessive reads as a tab label beside the other two.
- **Keeping the verbs on the tool chips.** Rejected: «تكتب» is a sentence about
  the tool in the present tense; a capability label is a noun.
- **Leaving the states unmarked.** Rejected: the surrounding copy is vocalised,
  so an unmarked state looks like a different voice rather than a shorter one.

## Consequences

- ADR-0146's recorded trigger «تطبيقاتنا» is amended to «التَّطبيقات»; the route,
  the sheet and the tabs are unchanged.
- The LinkSnap empty state's copy source loses `emptyAction`, and its parity row
  keeps only the sentence and the description.
- The native strings follow the shared source: `ServicesCopy.TRIGGER`,
  `ServicesSheetCopy.TITLE` and the LinkSnap empty state are regenerated, not
  retyped.
