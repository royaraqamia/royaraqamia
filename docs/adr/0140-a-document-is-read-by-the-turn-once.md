# A document is read by the turn, once

The assistant learned to hear a voice note (#1030, ADR-0126), then to read a file
(#1042, ADR-0127), then to see a picture (#1155, ADR-0139). The paperclip takes
everything else already: a member can attach the invoice they are asking about,
the file is uploaded and stored, the bubble shows its name — and the turn answers
«لا أستطيع قراءة هذا النوع من الملفات». A PDF is the one attachment whose bytes
never reached the model.

## Decision

1. **The turn reads the file, not the page.** `ChatAgentService.readAttachments`
   downloads the bytes through the member's own session
   (`ChatAttachmentStorage.download`), the way it already does for a voice note,
   and extracts the text beside `spokenQuestion`. No new route, no new screen, no
   queue, no job: the text exists inside the turn that asked for it.
2. **Pure JavaScript readers, so the deploy gains no build step.** `unpdf`
   bundles a serverless PDF.js and reads the text layer page by page; `JSZip`
   opens the zipped formats and `fast-xml-parser` walks their XML in document
   order. A memo's paragraphs and table rows, a workbook's sheets as
   `sheet · row · cells`, a deck's slides — each reaches the model as one `text`
   part under the frame «هذا نصّ المستند الذي أرفقه العضو:». There is no native
   binary, no ffmpeg, no LibreOffice.
3. **Caps, and the answer says it stopped.** A turn reads 20 pages or slides,
   5 sheets and 100 000 characters. The reader returns what it left out, the part
   carries that line, and the model is told to say it: a cut document is never
   passed off as a whole one.
4. **A scan is a sentence, not a guess.** A PDF whose pages carry no text layer
   answers «هذا المستند صور ممسوحة…», makes no model call and returns the
   allowance it reserved — the same path a recording that would not transcribe
   takes. A locked PDF and a file no reader could open have their own sentences.
   There is no OCR in this stack, and pretending otherwise would be the one
   failure a member could not detect.
5. **One document per turn.** `ChatAgentTurnSchema` bounds it beside the picture
   bound, and the assistant's composer refuses a second document before it
   uploads — a document is read once into the prompt and costs pages of tokens,
   so a second one is a second question. Both bounds count the `attachments`
   array ADR-0139 already had, rather than a field of their own.
6. **The words are not stored.** The attachment row keeps the file; the extracted
   text is a part of that turn and dies with it. It is not written to the message,
   not put in the bucket, not kept on the attachment, and not re-sent from
   history: `trimHistory` joins bodies, so an old document is drawn in the thread
   and never read again.
7. **The file stays in the thread.** The member's message carries the attachment
   exactly as before. A document adds no words to the message body — unlike a
   transcript, its text belongs to the model's prompt, not to something the
   member "said".

## Consequences

- A 25 MB invoice costs a few pages of prompt, not 25 MB of tokens.
- Extraction runs inside the turn's 55-second budget. Twenty pages of prose is
  fast; a heavily vectorised PDF spends seconds of it, and a turn that runs out
  of time fails the way it already does.
- A document that ends at a cap is answered with a sentence about the cap in the
  prompt. The model has to relay it, so the sentence is a strong instruction
  rather than a guarantee — the alternative was to refuse the document.
- A spreadsheet's dates arrive as the serial numbers the file stores, because
  number formats live in a part this reader does not walk. A member asking about
  a column of dates is answered about numbers.
- Text files are unchanged: ADR-0127's 20 000 characters, read as they are. A
  CSV is text — its header is its first row — so it is not routed through the
  workbook reader.
- An abandoned turn's resume replays the thread's words, and the document is not
  among them: documents in history replay stay out of scope, so a resumed turn
  answers without the file it was given.
- Three dependencies (~5 MB) now ship in the server bundle, and the PDF one is
  the reason `npm run build` is worth running on a change to this file.

## Alternatives considered

- **OCR the scan** (tesseract.js or a service): reads a photographed invoice, at
  a WASM model of tens of megabytes, seconds per page, and an error rate the
  answer could not state. A scanned page gets a sentence instead, which is the
  truth.
- **Store the extracted text on the attachment.** Searchable and re-answerable,
  and it is a second copy of a member's document in a place they did not put it,
  plus a migration and a backfill to keep it true.
- **`xlsx` from npm for the workbook.** The registry's build is stale at 0.18.5
  and carries the prototype-pollution and ReDoS advisories fixed only in the
  vendor's own distribution, and `pdf-parse` wraps the same PDF.js behind a
  module that reads a test file on import. Two readers of our own with one XML
  walker cost less than either.
- **Convert on upload** — LibreOffice or a document service, storing a text
  rendition beside the file: the best fidelity (number formats included), at a
  native binary and a job the Hobby plan should not run for a chat turn.
- **Send the document to the provider as bytes.** The gateway's model takes
  text and images; a PDF part would be a provider feature this deployment does
  not have.
