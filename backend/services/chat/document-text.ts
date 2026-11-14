import { XMLParser } from 'fast-xml-parser';
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
 * The three readers are pure JavaScript on purpose (unpdf bundles a serverless
 * PDF.js, JSZip opens a zip, and the XML is walked in order). No native build,
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
 * Bytes one archive entry may inflate to. A memo's `word/document.xml` is far
 * below this; the ceiling is what keeps a zip bomb from turning one upload into
 * gigabytes of XML before the text cap ever sees it.
 */
export const DOCUMENT_ENTRY_MAX_BYTES = 8 * 1024 * 1024;
/** Inflation across every entry one document reads, not just the largest. */
export const DOCUMENT_ARCHIVE_MAX_BYTES = 16 * 1024 * 1024;
/** Entries one package may carry; a normal document is a few dozen. */
export const DOCUMENT_ENTRIES_MAX = 2_000;
/** Documents read at once: the free instance has 512 MB, and a parser tree is many times its bytes. */
const DOCUMENT_READS_MAX = 2;

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
 * A process-wide ceiling on concurrent document reads. Nothing here streams:
 * PDF.js holds the file and the XML parser holds a tree many times its size, so
 * two large documents at once would spend most of the free instance's 512 MB
 * before either one answers.
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
 * states gets, because it knows what the member sent.
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
  walkWord(parseXml(body), words);
  return words.read();
}

/**
 * The body of a memo, in order: paragraphs end a line, and a table row is one
 * line with its cells side by side. A tracked deletion and a field's code are
 * not words the author wrote, so neither is read.
 */
function walkWord(nodes: XmlNode[], words: Words): void {
  for (const node of nodes) {
    for (const [tag, value] of Object.entries(node)) {
      if (tag === '#text') {
        words.push(String(value));
        continue;
      }
      if (tag === ':@') continue;
      if (tag === 'delText' || tag === 'instrText') continue;

      const children = value as XmlNode[];
      if (tag === 'tab') {
        words.push('\t');
        continue;
      }
      if (tag === 'br' || tag === 'cr') {
        words.push('\n');
        continue;
      }
      if (tag === 'tr') {
        words.push(cellTexts(children, 'tc').join(' | '), '\n');
        continue;
      }
      if (tag === 'p') {
        walkWord(children, words);
        words.push('\n');
        continue;
      }
      walkWord(children, words);
    }
    if (words.full) return;
  }
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
      pushRows(words, table.attrs['@_name'] ?? `Sheet${index + 1}`, odsRows(table.children));
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

/** The workbook's sheets, in the order they are drawn, resolved to zip paths. */
async function xlsxSheets(zip: JSZip, budget: ArchiveBudget): Promise<Sheet[]> {
  const workbook = await entryText(zip, XLSX_WORKBOOK, budget);
  const rels = await entryText(zip, XLSX_RELS, budget);
  if (!workbook || !rels) throw new DocumentReadError('broken');

  const targets = new Map<string, string>();
  for (const relation of collect(parseXml(rels), 'Relationship')) {
    const id = relation.attrs['@_Id'];
    const target = relation.attrs['@_Target'];
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  return collect(parseXml(workbook), 'sheet').map((sheet, index) => ({
    name: sheet.attrs['@_name'] ?? `Sheet${index + 1}`,
    path: targets.get(sheet.attrs['@_id'] ?? '') ?? `xl/worksheets/sheet${index + 1}.xml`,
  }));
}

/** The workbook's shared-string table: the words a cell references by number. */
async function xlsxStrings(zip: JSZip, budget: ArchiveBudget): Promise<string[]> {
  const xml = await entryText(zip, XLSX_SHARED_STRINGS, budget);
  if (xml === null) return [];
  return collect(parseXml(xml), 'si').map((entry) => elementText(entry.children));
}

/** A spreadsheet's cells, a shared string resolved to the word it stands for. */
function xlsxRows(tree: XmlNode[], shared: string[]): Row[] {
  return collect(tree, 'row').map((row, index) => {
    const cells: string[] = [];
    for (const cell of collect(row.children, 'c')) {
      const value = cellValue(cell, shared);
      if (value.trim().length > 0) cells.push(value.trim());
    }
    return { index: row.attrs['@_r'] ?? String(index + 1), cells };
  });
}

/**
 * A cell's words: the `<v>` value it cached, never the `<f>` formula beside it.
 * A formula cell carries both — `<f>SUM(B1:B3)</f><v>42</v>` — and the whole
 * subtree read as text is `SUM(B1:B3)42`, which is not what the sheet shows.
 */
function cellValue(cell: Element, shared: string[]): string {
  const type = cell.attrs['@_t'];
  if (type === 'inlineStr') {
    return collect(cell.children, 'is')
      .map((inline) => elementText(inline.children))
      .join('');
  }

  const value = collect(cell.children, 'v')
    .map((cached) => elementText(cached.children))
    .join('');
  if (type === 's') return shared[Number(value)] ?? '';
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE';
  return value;
}

/** The rows of one ODS table, by the name the sheet gave. */
function odsRows(nodes: XmlNode[]): Row[] {
  return collect(nodes, 'table-row').map((row, index) => {
    const cells = cellTexts(row.children, 'table-cell').filter((cell) => cell.length > 0);
    return { index: String(index + 1), cells };
  });
}

/** The words of each cell in a row, one string apiece. */
function cellTexts(nodes: XmlNode[], tag: string): string[] {
  return collect(nodes, tag).map((cell) => {
    const paragraphs = collect(cell.children, 'p');
    const text =
      paragraphs.length > 0
        ? paragraphs.map((paragraph) => elementText(paragraph.children)).join(' ')
        : elementText(cell.children);
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
    walkSlide(parseXml(xml), words);
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

/** A slide's text boxes, in the order the deck paints them. */
function walkSlide(nodes: XmlNode[], words: Words): void {
  for (const node of nodes) {
    for (const [tag, value] of Object.entries(node)) {
      if (tag === '#text') {
        words.push(String(value));
        continue;
      }
      if (tag === ':@') continue;

      const children = value as XmlNode[];
      if (tag === 'p') {
        walkSlide(children, words);
        words.push('\n');
        continue;
      }
      walkSlide(children, words);
    }
    if (words.full) return;
  }
}

/* --------------------------------------------------------------- shared --- */

/**
 * An ordered XML tree: one object per element, its children under its own tag,
 * its attributes under `:@`, and its text under `#text`
 * (`fast-xml-parser`'s `preserveOrder` shape). The order is the point — a
 * document's words only read as words in it.
 */
type XmlNode = Record<string, unknown>;

interface Element {
  attrs: Record<string, string>;
  children: XmlNode[];
}

const XML = new XMLParser({
  preserveOrder: true,
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: false,
});

function parseXml(xml: string): XmlNode[] {
  try {
    return XML.parse(xml) as XmlNode[];
  } catch {
    throw new DocumentReadError('broken');
  }
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

/** Every element called `tag`, at any depth, in document order. */
function collect(nodes: XmlNode[], tag: string): Element[] {
  const found: Element[] = [];
  visit(nodes, tag, found);
  return found;
}

function visit(nodes: XmlNode[], tag: string, found: Element[]): void {
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node)) {
      if (key === '#text' || key === ':@' || !Array.isArray(value)) continue;
      const children = value as XmlNode[];
      if (key === tag) {
        found.push({ attrs: attributesOf(node), children });
      }
      visit(children, tag, found);
      break;
    }
  }
}

function attributesOf(node: XmlNode): Record<string, string> {
  const attrs = node[':@'];
  return typeof attrs === 'object' && attrs !== null ? (attrs as Record<string, string>) : {};
}

/** All the words an element holds, wherever they sit inside it. */
function elementText(nodes: XmlNode[]): string {
  let text = '';
  for (const node of nodes) {
    for (const [tag, value] of Object.entries(node)) {
      if (tag === '#text') text += String(value);
      else if (tag !== ':@') text += elementText(value as XmlNode[]);
    }
  }
  return text;
}
