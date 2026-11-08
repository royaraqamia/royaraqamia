import JSZip from 'jszip';

/**
 * Documents a reader can be pointed at, built in the test rather than committed
 * as bytes: a fixture a person can read in the diff is a fixture that stays
 * true when the reader changes.
 */

/**
 * A PDF with one page per entry, and one text line per string.
 *
 * The text is WinAnsi, so a fixture's words are ASCII; the page count is what
 * the caps are asserted against, and it is the caller's.
 */
export function pdfDocument(pages: (string | string[])[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pages.length} >>`;

  pages.forEach((page, index) => {
    const pageId = pageIds[index]!;
    const contentId = pageId + 1;
    const lines = typeof page === 'string' ? [page] : page;
    // Each line is its own text item, the way a real page's lines are.
    const drawn = lines
      .map((line, at) => `${at === 0 ? '' : '0 -14 Td '}(${escapePdf(line)}) Tj`)
      .join(' ');
    const stream = `BT /F1 12 Tf 72 770 Td ${drawn} ET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  });

  objects[fontId] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = Buffer.byteLength(out, 'latin1');
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) {
    out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(out, 'latin1'));
}

/** A page with an image and no text operators: what a scan looks like here. */
export function scannedPdf(): Uint8Array {
  return pdfDocument(['']);
}

/** A memo: one paragraph per line, and a table row when `rows` is given. */
export async function docxDocument(
  paragraphs: string[],
  rows: string[][] = []
): Promise<Uint8Array> {
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p>`)
    .join('');
  const table =
    rows.length === 0
      ? ''
      : `<w:tbl>${rows
          .map(
            (row) =>
              `<w:tr>${row
                .map((cell) => `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`)
                .join('')}</w:tr>`
          )
          .join('')}</w:tbl>`;

  return zip({
    'word/document.xml':
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}${table}</w:body></w:document>`,
  });
}

export interface SheetFixture {
  name: string;
  rows: (string | number)[][];
}

/** A workbook, its header row a shared string and its numbers inline. */
export async function xlsxDocument(sheets: SheetFixture[]): Promise<Uint8Array> {
  const shared: string[] = [];
  const sharedIndex = (value: string) => {
    const existing = shared.indexOf(value);
    if (existing !== -1) return existing;
    shared.push(value);
    return shared.length - 1;
  };

  const files: Record<string, string> = {
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      sheets
        .map(
          (sheet, index) =>
            `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
        )
        .join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_sheet, index) =>
            `<Relationship Id="rId${index + 1}" ` +
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
            `Target="worksheets/sheet${index + 1}.xml"/>`
        )
        .join('') +
      '</Relationships>',
  };

  sheets.forEach((sheet, sheetIndex) => {
    const rows = sheet.rows
      .map((row, rowIndex) => {
        const cells = row
          .map((cell, columnIndex) => {
            const ref = `${column(columnIndex)}${rowIndex + 1}`;
            if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
            return `<c r="${ref}" t="s"><v>${sharedIndex(cell)}</v></c>`;
          })
          .join('');
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join('');

    files[`xl/worksheets/sheet${sheetIndex + 1}.xml`] =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${rows}</sheetData></worksheet>`;
  });

  files['xl/sharedStrings.xml'] =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
      .map((value) => `<si><t>${escapeXml(value)}</t></si>`)
      .join('')}</sst>`;

  return zip(files);
}

/** An ODS workbook: the same cells in the other format's clothes. */
export async function odsDocument(sheets: SheetFixture[]): Promise<Uint8Array> {
  const tables = sheets
    .map(
      (sheet) =>
        `<table:table table:name="${escapeXml(sheet.name)}">` +
        sheet.rows
          .map(
            (row) =>
              `<table:table-row>${row
                .map(
                  (cell) =>
                    '<table:table-cell office:value-type="string">' +
                    `<text:p>${escapeXml(String(cell))}</text:p>` +
                    '</table:table-cell>'
                )
                .join('')}</table:table-row>`
          )
          .join('') +
        '</table:table>'
    )
    .join('');

  return zip({
    'content.xml':
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content ' +
      'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
      `<office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body>` +
      '</office:document-content>',
  });
}

/** A deck: one paragraph per line, one file per slide. */
export async function pptxDocument(slides: string[][]): Promise<Uint8Array> {
  const files: Record<string, string> = {};

  slides.forEach((slide, index) => {
    const paragraphs = slide
      .map((line) => `<a:p><a:r><a:t>${escapeXml(line)}</a:t></a:r></a:p>`)
      .join('');
    files[`ppt/slides/slide${index + 1}.xml`] =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      `<p:cSld><p:spTree><p:sp><p:txBody>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld>` +
      '</p:sld>';
  });

  return zip(files);
}

async function zip(files: Record<string, string>): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const [path, content] of Object.entries(files)) archive.file(path, content);
  return archive.generateAsync({ type: 'uint8array' });
}

/** A column's letters, so a fixture writes `A1` the way a spreadsheet does. */
function column(index: number): string {
  let name = '';
  let value = index;
  do {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return name;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A PDF string literal's two characters that must be escaped. */
function escapePdf(value: string): string {
  return value.replace(/[()\\]/g, '\\$&');
}
