import { SaxesParser, type SaxesTagPlain } from 'saxes';
import JSZip from 'jszip';
import { getDocumentProxy } from 'unpdf';

import { CHAT_DOCUMENT_MIME_TYPES } from '@/shared/contracts/chat';

/**
 * The words inside a document, for the turn that reads it (#1037, ADR-0140).
 *
 * A model cannot take any of these formats as it stands, and the page cannot
 * read them either, so the turn — on the Node runtime — extracts the text and
 * hands it over as one `text` part. The file itself is never converted, stored
 * again, or sent anywhere but the bucket it already lives in: what this module
 * returns exists for the one turn that asked.
 *
 * The readers are pure JavaScript on purpose (unpdf bundles a serverless
 * PDF.js, JSZip opens a zip, and the XML is read as events). No native build,
 * no ffmpeg, nothing to compile on the deploy.
 */

/** Pages of a PDF, or slides of a deck, one turn reads. */
export const DOCUMENT_PAGES_MAX = 20;
/** Sheets of a workbook one turn reads. */
export const DOCUMENT_SHEETS_MAX = 5;
/**
 * Characters one turn takes from a document. Well inside the provider's
 * context, and the point at which the answer has to say it stopped.
 */
export const DOCUMENT_TEXT_MAX = 100_000;
/**
 * Bytes one archive entry may inflate to. A memo's `word/document.xml` is a few
 * kilobytes; this ceiling is what keeps one upload from spending the free
 * instance's 512 MB on a parser tree (measured: 7.5 MB of XML cost 166 MB of
 * RSS with the old DOM parser).
 */
export const DOCUMENT_ENTRY_MAX_BYTES = 1 * 1024 * 1024;
/** Inflation across every entry one document reads, not just the largest. */
export const DOCUMENT_ARCHIVE_MAX_BYTES = 2 * 1024 * 1024;
/**
 * A PDF is not a zip: its object graph is bounded by the file, not by an entry
 * budget, and PDF.js holds the whole document. Above this size the reader
 * refuses before PDF.js allocates anything.
 */
export const DOCUMENT_PDF_MAX_BYTES = 5 * 1024 * 1024;
/** Entries one package may carry; a normal document is a few dozen. */
export const DOCUMENT_ENTRIES_MAX = 2_000;
/** Documents read at once: the free instance has one 512 MB budget, not two. */
const DOCUMENT_READS_MAX = 1;

/** What a document says, and the one sentence naming what was left out. */
export interface DocumentReading {
  text: string;
  /** What the reader stopped short of, or `null` when it read all of it. */
  cut: string | null;
}

/**
 * A document that exists and cannot be opened. A file with no text at all is
 * not a refusal: it is `null`, because the answer to a scan is a sentence
 * about scans and not about the file being broken.
 */
export class DocumentReadError extends Error {
  constructor(readonly reason: 'encrypted' | 'broken') {
    super(
      reason === 'encrypted'
        ? 'the document is password-protected'
        : 'the document could not be read'
    );
    this.name = 'DocumentReadError';
  }
}

let activeReads = 0;
const waitingReads: Array<() => void> = [];

/**
 * A process-wide ceiling on concurrent document reads. PDF.js holds the file
 * and a parser holds more than its bytes; a second read queues rather than
 * spending two halves of the free instance's 512 MB at the same time.
 */
async function withDocumentSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeReads >= DOCUMENT_READS_MAX) {
    await new Promise<void>((resolve) => waitingReads.push(resolve));
  } else {
    activeReads += 1;
  }

  try {
    return await work();
  } finally {
    const next = waitingReads.shift();
    if (next) next();
    else activeReads -= 1;
  }
}

const [PDF_MIME, DOCX_MIME, XLSX_MIME, ODS_MIME, PPTX_MIME] = CHAT_DOCUMENT_MIME_TYPES;

/**
 * The words of one document, or `null` when it carries none a reader can see —
 * a scanned PDF, an empty memo. The caller owns the sentence each of those
 * states gets, because it knows the member sent.
 *
 * The MIME type decides the reader; the list is `CHAT_DOCUMENT_MIME_TYPES`, so a
 * format the contract accepts is a format this module reads.
 */
export async function readDocumentText(
  bytes: Uint8Array,
  mimeType: string
): Promise<DocumentReading | null> {
  return withDocumentSlot(() => readDocumentTextNow(bytes, mimeType));
}

async function readDocumentTextNow(
  bytes: Uint8Array,
  mimeType: string
): Promise<DocumentReading | null> {
  const mime = mimeType.trim().toLowerCase();

  if (mime === PDF_MIME) return readPdf(bytes);
  if (mime === DOCX_MIME) return readDocx(bytes);
  if (mime === XLSX_MIME) return readWorkbook(bytes, 'xlsx');
  if (mime === ODS_MIME) return readWorkbook(bytes, 'ods');
  if (mime === PPTX_MIME) return readSlides(bytes);

  // The contract's list and this dispatch are one list; a format that reached
  // here without a reader is a bug in that pair, not a member's file.
  throw new Error(`No document reader for ${mime}`);
}

/**
 * The text a reader has collected so far, and why it stopped. Pages, sheets and
 * rows are all bounded; the character ceiling is the one that always applies,
 * so a spreadsheet with a hundred thousand rows costs a page of prompt and no
 * more.
 */
class Words {
  private readonly pieces: string[] = [];
  private length = 0;
  private stop: string | null = null;

  get full(): boolean {
    return this.stop !== null;
  }

  push(...pieces: string[]): void {
    for (const piece of pieces) {
      if (this.stop) return;
      this.pieces.push(piece);
      this.length += piece.length;
      if (this.length >= DOCUMENT_TEXT_MAX) this.stop = cutAtCeiling();
    }
  }

  /** Names the bound that ended the reading, unless one already did. */
  reached(reason: string): void {
    this.stop ??= reason;
  }

  read(): DocumentReading | null {
    const text = this.pieces
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, DOCUMENT_TEXT_MAX)
      .trim();
    return text.length === 0 ? null : { text, cut: this.stop };
  }
}

function cutAtCeiling(): string {
  return `اقتطعتُ النص عند ${DOCUMENT_TEXT_MAX} حرف`;
}

/* ------------------------------------------------------------------ PDF --- */

async function readPdf(bytes: Uint8Array): Promise<DocumentReading | null> {
  // The page cap bounds the text, not the file's object graph or its embedded
  // images: refuse a large file before PDF.js holds any of it.
  if (bytes.byteLength > DOCUMENT_PDF_MAX_BYTES) throw new DocumentReadError('broken');

  const pdf = await getDocumentProxy(new Uint8Array(bytes)).catch((error: unknown) => {
    throw refusal(error);
  });

  const words = new Words();
  try {
    const pages = Math.min(pdf.numPages, DOCUMENT_PAGES_MAX);

    for (let index = 1; index <= pages; index += 1) {
      const page = await pdf.getPage(index).catch((error: unknown) => {
        throw refusal(error);
      });
      const content = await page.getTextContent();
      for (const item of content.items) {
        // Marked content carries no words of its own; only a text item does.
        if (!('str' in item)) continue;
        words.push(item.str, item.hasEOL ? '\n' : '');
      }
      words.push('\n\n');
      page.cleanup();
      if (words.full) break;
    }

    if (pdf.numPages > DOCUMENT_PAGES_MAX) {
      words.reached(`عرضتُ أول ${DOCUMENT_PAGES_MAX} صفحة من ${pdf.numPages}`);
    }
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }

  return words.read();
}

/** Why a PDF would not open, in the two states the answer distinguishes. */
function refusal(error: unknown): DocumentReadError {
  const name = (error as { name?: unknown } | null)?.name;
  return new DocumentReadError(name === 'PasswordException' ? 'encrypted' : 'broken');
}

/* ----------------------------------------------------------------- DOCX --- */

const DOCX_BODY = 'word/document.xml';

async function readDocx(bytes: Uint8Array): Promise<DocumentReading | null> {
  const zip = await openZip(bytes);
  const budget = newArchiveBudget();
  const body = await entryText(zip, DOCX_BODY, budget);
  if (body === null) throw new DocumentReadError('broken');

  const words = new Words();
  walkWord(body, words);
  return words.read();
}

/**
 * The body of a memo, in order: paragraphs end a line, and a table row is one
 * line with its cells side by side. A tracked deletion and a field's code are
 * not words the author wrote, so neither is read. The XML is fed as events —
 * no tree is held, which is what keeps a document's bytes from becoming tens
 * of times their size in RSS.
 */
function walkWord(xml: string, words: Words): void {
  const stack: string[] = [];
  let cells: string[] = [];
  let paragraphs: string[][] = [];
  let directCellText: string[] = [];
  let skippedElementsDeep = 0;
  const inCell = () => stack.includes('tc');

  streamXml(
    xml,
    (tag) => {
      stack.push(tag);
      if (tag === 'delText' || tag === 'instrText') skippedElementsDeep += 1;
      if (tag === 'tc') {
        paragraphs = [];
        directCellText = [];
      }
      if (tag === 'p' && inCell()) paragraphs.push([]);
      // A tab or a manual break is an empty element: no text event will carry
      // it, so the old tree reader's two cases have to be pushed explicitly.
      if (skippedElementsDeep === 0 && !inCell()) {
        if (tag === 'tab') words.push('\t');
        else if (tag === 'br' || tag === 'cr') words.push('\n');
      }
    },
    (text) => {
      if (words.full) return;
      if (inCell()) {
        // The tree reader's cellTexts used the paragraphs when there were any
        // and fell back to the whole subtree otherwise — including tracked
        // deletions, which the body walk skips but the cell walk did not.
        if (stack.includes('p') && paragraphs.length > 0) paragraphs.at(-1)?.push(text);
        else directCellText.push(text);
      } else if (skippedElementsDeep === 0) {
        words.push(text);
      }
    },
    (tag) => {
      if (tag === 'delText' || tag === 'instrText') skippedElementsDeep -= 1;
      stack.pop();
      if (tag === 'tc') {
        const text =
          paragraphs.length > 0
            ? paragraphs.map((parts) => parts.join('')).join(' ')
            : directCellText.join('');
        cells.push(text.replace(/\s+/g, ' ').trim());
      } else if (tag === 'tr') {
        words.push(cells.join(' | '), '\n');
        cells = [];
      } else if (tag === 'p' && !stack.includes('tr')) {
        words.push('\n');
      }
    }
  );
}

/* ------------------------------------------------------------ workbooks --- */

const XLSX_WORKBOOK = 'xl/workbook.xml';
const XLSX_RELS = 'xl/_rels/workbook.xml.rels';
const XLSX_SHARED_STRINGS = 'xl/sharedStrings.xml';
const ODS_CONTENT = 'content.xml';

/**
 * A sheet, one row to a line: the sheet's name, the row's number, then the
 * cells that are not empty joined by a bar. A row number is what the member
 * reads in their own spreadsheet, so the answer can point at it.
 */
async function readWorkbook(
  bytes: Uint8Array,
  kind: 'xlsx' | 'ods'
): Promise<DocumentReading | null> {
  const zip = await openZip(bytes);
  const budget = newArchiveBudget();
  const words = new Words();

  if (kind === 'ods') {
    const content = await entryText(zip, ODS_CONTENT, budget);
    if (content === null) throw new DocumentReadError('broken');

    const tables = collect(parseXml(content), 'table');
    for (const [index, table] of tables.slice(0, DOCUMENT_SHEETS_MAX).entries()) {
      pushRows(words, table.attrs.name ?? `Sheet${index + 1}`, odsRows(table.content));
      if (words.full) break;
    }
    if (tables.length > DOCUMENT_SHEETS_MAX) words.reached(cutSheets(tables.length));

    return words.read();
  }

  const sheets = await xlsxSheets(zip, budget);
  const shared = await xlsxStrings(zip, budget);

  for (const sheet of sheets.slice(0, DOCUMENT_SHEETS_MAX)) {
    const xml = await entryText(zip, sheet.path, budget);
    if (xml === null) continue;
    pushRows(words, sheet.name, xlsxRows(parseXml(xml), shared));
    if (words.full) break;
  }
  if (sheets.length > DOCUMENT_SHEETS_MAX) words.reached(cutSheets(sheets.length));

  return words.read();
}

function cutSheets(total: number): string {
  return `عرضتُ أول ${DOCUMENT_SHEETS_MAX} أوراق من ${total}`;
}

function pushRows(words: Words, sheet: string, rows: Row[]): void {
  for (const row of rows) {
    if (row.cells.length === 0) continue;
    words.push(`${sheet} · ${row.index} · ${row.cells.join(' | ')}\n`);
    if (words.full) return;
  }
}

interface Sheet {
  name: string;
  path: string;
}

interface Row {
  index: string;
  cells: string[];
}

/** Every element called `tag`, at any depth, in document order. */
function collect(nodes: XmlContent, tag: string): XmlNode[] {
  const found: XmlNode[] = [];
  const visit = (node: XmlNode | string): void => {
    if (typeof node === 'string') return;
    if (node.tag === tag) found.push(node);
    for (const child of node.content) visit(child);
  };
  for (const node of nodes) visit(node);
  return found;
}

/** All the words an element holds, wherever they sit inside it. */
function elementText(nodes: XmlContent): string {
  let text = '';
  for (const node of nodes) {
    text += typeof node === 'string' ? node : elementText(node.content);
  }
  return text;
}

/**
 * The workbook's sheets, in the order they are drawn, resolved to zip paths.
 */
async function xlsxSheets(zip: JSZip, budget: ArchiveBudget): Promise<Sheet[]> {
  const workbook = await entryText(zip, XLSX_WORKBOOK, budget);
  const rels = await entryText(zip, XLSX_RELS, budget);
  if (!workbook || !rels) throw new DocumentReadError('broken');

  const targets = new Map<string, string>();
  for (const relation of collect(parseXml(rels), 'Relationship')) {
    const id = relation.attrs.Id;
    const target = relation.attrs.Target;
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  return collect(parseXml(workbook), 'sheet').map((sheet, index) => ({
    name: sheet.attrs.name ?? `Sheet${index + 1}`,
    path: targets.get(sheet.attrs.id ?? '') ?? `xl/worksheets/sheet${index + 1}.xml`,
  }));
}

/** The workbook's shared-string table: the words a cell references by number. */
async function xlsxStrings(zip: JSZip, budget: ArchiveBudget): Promise<string[]> {
  const xml = await entryText(zip, XLSX_SHARED_STRINGS, budget);
  if (xml === null) return [];
  return collect(parseXml(xml), 'si').map((entry) => elementText(entry.content));
}

/** A spreadsheet's cells, one row at a time, with shared strings resolved. */
function xlsxRows(root: XmlNode[], shared: string[]): Row[] {
  return collect(root, 'row').map((row, index) => {
    const cells: string[] = [];
    for (const cell of collect(row.content, 'c')) {
      const value = cellValue(cell, shared);
      if (value.trim().length > 0) cells.push(value.trim());
    }
    return { index: row.attrs.r ?? String(index + 1), cells };
  });
}

/**
 * A cell's words: the `<v>` value it cached, never the `<f>` formula beside it.
 * A formula cell carries both — `<f>SUM(B1:B3)</f><v>42</v>` — and the whole
 * subtree read as text would be `SUM(B1:B3)42`, which is not what the sheet shows.
 */
function cellValue(cell: XmlNode, shared: string[]): string {
  const type = cell.attrs.t;
  if (type === 'inlineStr') {
    return collect(cell.content, 'is')
      .map((entry) => elementText(entry.content))
      .join('');
  }

  const value = collect(cell.content, 'v')
    .map((entry) => elementText(entry.content))
    .join('');
  if (type === 's') return shared[Number(value)] ?? '';
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';
  return value;
}

/** The rows of one ODS table, by the name of the sheet that owns them. */
function odsRows(nodes: XmlContent): Row[] {
  return collect(nodes, 'table-row').map((row, index) => {
    const cells = cellTexts(row.content, 'table-cell').filter((cell) => cell.length > 0);
    return { index: String(index + 1), cells };
  });
}

/**
 * A cell's text, one string per paragraph. ODS rows carry no number, so the
 * position in the row is the index the reader shows.
 */
function cellTexts(nodes: XmlContent, tag: string): string[] {
  return collect(nodes, tag).map((cell) => {
    const paragraphs = collect(cell.content, 'p');
    const text =
      paragraphs.length > 0
        ? paragraphs.map((paragraph) => elementText(paragraph.content)).join(' ')
        : elementText(cell.content);
    return text.replace(/\s+/g, ' ').trim();
  });
}

/* ----------------------------------------------------------------- PPTX --- */

const PPTX_SLIDE = /^ppt\/slides\/slide(\d+)\.xml$/;

/** A deck's slides, one to a block, each paragraph on its own line. */
async function readSlides(bytes: Uint8Array): Promise<DocumentReading | null> {
  const zip = await openZip(bytes);
  const budget = newArchiveBudget();
  const slides = Object.keys(zip.files)
    .filter((path) => PPTX_SLIDE.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  if (slides.length === 0) throw new DocumentReadError('broken');

  const words = new Words();
  const read = slides.slice(0, DOCUMENT_PAGES_MAX);

  for (const [index, path] of read.entries()) {
    const xml = await entryText(zip, path, budget);
    if (xml === null) continue;
    if (index > 0) words.push('\n\n');
    walkSlide(xml, words);
    if (words.full) break;
  }

  if (slides.length > read.length) {
    words.reached(`عرضتُ أول ${DOCUMENT_PAGES_MAX} شريحة من ${slides.length}`);
  }

  return words.read();
}

function slideNumber(path: string): number {
  return Number(PPTX_SLIDE.exec(path)?.[1] ?? 0);
}

/** A slide's text boxes, in the order the deck paints them, read as events. */
function walkSlide(xml: string, words: Words): void {
  streamXml(
    xml,
    () => undefined,
    (text) => words.push(text),
    (tag) => {
      if (tag === 'p' && !words.full) words.push('\n');
    }
  );
}

/* --------------------------------------------------------------- shared --- */

/**
 * A compact XML event tree for the readers that need attributes and subtrees
 * (workbooks and ODS). One object per element, its children in document order,
 * namespace prefixes removed — the same shape everywhere, without the old
 * object-per-text-node overhead.
 */
interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  content: XmlContent;
}

type XmlContent = Array<XmlNode | string>;

function localName(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1);
}

function attributesOf(attributes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'xmlns' || key.startsWith('xmlns:')) continue;
    out[localName(key)] = value;
  }
  return out;
}

/**
 * One SAX event stream, shared by both readers. A broken entry is an ordinary
 * refusal, never a throw from the parser into a route handler.
 */
function feedXml(
  xml: string,
  onOpen: (tag: SaxesTagPlain) => void,
  onText: (text: string) => void,
  onClose: (tag: SaxesTagPlain) => void
): void {
  const parser = new SaxesParser();
  let broken = false;

  parser.on('error', () => {
    broken = true;
  });
  parser.on('opentag', onOpen);
  parser.on('text', onText);
  parser.on('cdata', onText);
  parser.on('closetag', onClose);

  try {
    parser.write(xml).close();
  } catch {
    broken = true;
  }
  if (broken) throw new DocumentReadError('broken');
}

/**
 * The memo and deck readers feed `Words` straight from parser events — no
 * tree is held at all. The workbook readers use `parseXml` below for the few
 * attributes and subtrees they need.
 */
function streamXml(
  xml: string,
  onOpen: (tag: string) => void,
  onText: (text: string) => void,
  onClose: (tag: string) => void
): void {
  feedXml(
    xml,
    (tag) => onOpen(localName(tag.name)),
    onText,
    (tag) => onClose(localName(tag.name))
  );
}

function parseXml(xml: string): XmlNode[] {
  const roots: XmlNode[] = [];
  const stack: XmlNode[] = [];

  feedXml(
    xml,
    (tag) => {
      const node: XmlNode = {
        tag: localName(tag.name),
        attrs: attributesOf(tag.attributes),
        content: [],
      };
      const parent = stack.at(-1);
      if (parent) parent.content.push(node);
      else roots.push(node);
      stack.push(node);
    },
    (text) => stack.at(-1)?.content.push(text),
    () => stack.pop()
  );

  return roots;
}

interface ArchiveBudget {
  left: number;
}

function newArchiveBudget(): ArchiveBudget {
  return { left: DOCUMENT_ARCHIVE_MAX_BYTES };
}

/**
 * The uncompressed size the archive's own directory declares. JSZip does not
 * expose it publicly, and inflating the entry to measure it is exactly the
 * allocation this check exists to prevent; `_data` is the field its reader uses.
 */
function declaredEntrySize(entry: JSZip.JSZipObject): number | null {
  const data = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
  return typeof data?.uncompressedSize === 'number' ? data.uncompressedSize : null;
}

/**
 * One entry's text, refused before inflation when the archive says it is over
 * the per-entry or remaining-archive budget. A normal memo is a handful of
 * kilobytes; a package that claims megabytes of XML is not one this reader
 * should spend the instance's memory on.
 */
async function entryText(zip: JSZip, path: string, budget: ArchiveBudget): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;

  const declared = declaredEntrySize(entry);
  if (declared !== null) {
    if (declared > DOCUMENT_ENTRY_MAX_BYTES || declared > budget.left) {
      throw new DocumentReadError('broken');
    }
    budget.left -= declared;
  }

  return entry.async('string');
}

async function openZip(bytes: Uint8Array): Promise<JSZip> {
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new DocumentReadError('broken');
  });

  if (Object.keys(zip.files).length > DOCUMENT_ENTRIES_MAX) {
    throw new DocumentReadError('broken');
  }

  return zip;
}
