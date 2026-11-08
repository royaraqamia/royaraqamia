import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_PAGES_MAX,
  DOCUMENT_SHEETS_MAX,
  DOCUMENT_TEXT_MAX,
  DocumentReadError,
  readDocumentText,
} from '@/backend/services/chat/document-text';
import { CHAT_DOCUMENT_MIME_TYPES } from '@/shared/contracts/chat';
import {
  docxDocument,
  odsDocument,
  pdfDocument,
  pptxDocument,
  scannedPdf,
  xlsxDocument,
} from './document-fixtures';

const [PDF, DOCX, XLSX, ODS, PPTX] = CHAT_DOCUMENT_MIME_TYPES;

describe('a PDF', () => {
  it('reads the words on its pages', async () => {
    const reading = await readDocumentText(
      pdfDocument(['Invoice total 120.00', 'Second page note']),
      PDF
    );

    expect(reading?.text).toContain('Invoice total 120.00');
    expect(reading?.text).toContain('Second page note');
    expect(reading?.cut).toBeNull();
  });

  it('reads nothing out of a page with no text layer', async () => {
    // A scan is a picture of a page: there is no OCR in this stack, and the
    // caller answers that sentence instead of guessing (ADR-0140).
    expect(await readDocumentText(scannedPdf(), PDF)).toBeNull();
  });

  it('stops at the page cap, and says which page it stopped at', async () => {
    const pages = Array.from(
      { length: DOCUMENT_PAGES_MAX + 14 },
      (_, index) => `page ${index + 1}`
    );

    const reading = await readDocumentText(pdfDocument(pages), PDF);

    expect(reading?.text).toContain(`page ${DOCUMENT_PAGES_MAX}`);
    expect(reading?.text).not.toContain(`page ${DOCUMENT_PAGES_MAX + 1}`);
    expect(reading?.cut).toContain(`${DOCUMENT_PAGES_MAX}`);
    expect(reading?.cut).toContain(`${pages.length}`);
  });

  it('refuses a file that is not a PDF at all', async () => {
    await expect(readDocumentText(new Uint8Array([1, 2, 3, 4]), PDF)).rejects.toBeInstanceOf(
      DocumentReadError
    );
  });
});

describe('a memo', () => {
  it('reads its paragraphs and its table, in order', async () => {
    const reading = await readDocumentText(
      await docxDocument(
        ['مذكرة داخلية', 'المبلغ الإجمالي 120 ليرة'],
        [
          ['البند', 'المبلغ'],
          ['اشتراك', '120'],
        ]
      ),
      DOCX
    );

    expect(reading?.text).toContain('مذكرة داخلية');
    expect(reading?.text).toContain('المبلغ الإجمالي 120 ليرة');
    expect(reading?.text).toContain('البند | المبلغ');
    expect(reading?.cut).toBeNull();
  });

  it('stops at the character ceiling, and says it did', async () => {
    const reading = await readDocumentText(
      await docxDocument(['a'.repeat(DOCUMENT_TEXT_MAX + 20_000)]),
      DOCX
    );

    expect(reading?.text).toHaveLength(DOCUMENT_TEXT_MAX);
    expect(reading?.cut).toContain(`${DOCUMENT_TEXT_MAX}`);
  });
});

describe('a workbook', () => {
  const sheets = [
    {
      name: 'المصاريف',
      rows: [
        ['الشهر', 'المجموع'],
        ['كانون الثاني', 120],
      ],
    },
  ];

  it('names the sheet and the row beside the cells', async () => {
    const reading = await readDocumentText(await xlsxDocument(sheets), XLSX);

    expect(reading?.text).toContain('المصاريف · 1 · الشهر | المجموع');
    expect(reading?.text).toContain('المصاريف · 2 · كانون الثاني | 120');
  });

  it('reads an ODS sheet the same way', async () => {
    const reading = await readDocumentText(await odsDocument(sheets), ODS);

    expect(reading?.text).toContain('المصاريف · 1 · الشهر | المجموع');
    expect(reading?.text).toContain('المصاريف · 2 · كانون الثاني | 120');
  });

  it('stops at the sheet cap, and says how many there are', async () => {
    const many = Array.from({ length: DOCUMENT_SHEETS_MAX + 2 }, (_, index) => ({
      name: `ورقة ${index + 1}`,
      rows: [['قيمة', index + 1]] as (string | number)[][],
    }));

    const reading = await readDocumentText(await xlsxDocument(many), XLSX);

    expect(reading?.text).toContain(`ورقة ${DOCUMENT_SHEETS_MAX}`);
    expect(reading?.text).not.toContain(`ورقة ${DOCUMENT_SHEETS_MAX + 1}`);
    expect(reading?.cut).toContain(`${DOCUMENT_SHEETS_MAX}`);
    expect(reading?.cut).toContain(`${many.length}`);
  });
});

describe('a deck', () => {
  it('reads its slides, one block at a time', async () => {
    const reading = await readDocumentText(
      await pptxDocument([['العنوان', 'الخطة السنوية'], ['الشريحة الثانية']]),
      PPTX
    );

    expect(reading?.text).toContain('العنوان');
    expect(reading?.text).toContain('الخطة السنوية');
    expect(reading?.text).toContain('الشريحة الثانية');
    expect(reading?.cut).toBeNull();
  });

  it('stops at the slide cap', async () => {
    const slides = Array.from({ length: DOCUMENT_PAGES_MAX + 3 }, (_, index) => [
      `شريحة ${index + 1}`,
    ]);

    const reading = await readDocumentText(await pptxDocument(slides), PPTX);

    expect(reading?.text).not.toContain(`شريحة ${DOCUMENT_PAGES_MAX + 1}`);
    expect(reading?.cut).toContain(`${slides.length}`);
  });
});

describe('the list of documents', () => {
  it('is the list this reader answers for, one format per entry', async () => {
    expect(CHAT_DOCUMENT_MIME_TYPES).toHaveLength(5);

    const fixtures: Record<string, () => Promise<Uint8Array>> = {
      [PDF]: async () => pdfDocument(['words']),
      [DOCX]: () => docxDocument(['words']),
      [XLSX]: () => xlsxDocument([{ name: 'ورقة', rows: [['كلمة']] }]),
      [ODS]: () => odsDocument([{ name: 'ورقة', rows: [['كلمة']] }]),
      [PPTX]: () => pptxDocument([['كلمة']]),
    };

    for (const mime of CHAT_DOCUMENT_MIME_TYPES) {
      const reading = await readDocumentText(await fixtures[mime]!(), mime);
      expect(reading?.text, mime).toBeTruthy();
    }
  });
});
