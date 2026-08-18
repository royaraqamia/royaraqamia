import { marked } from 'marked';

export type PostExportFormat = 'markdown' | 'html';

function slugifyFileName(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\w\u0600-\u06FF-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'post'
  );
}

/**
 * Downloads a blog post as a Markdown or HTML file. Uses a Blob + anchor so no
 * server round-trip is needed and the exported file matches the editor content.
 */
export async function downloadPostAsFile(
  title: string,
  markdown: string,
  format: PostExportFormat
): Promise<void> {
  const fileName = slugifyFileName(title);
  const isHtml = format === 'html';
  const content = isHtml ? await marked.parse(markdown) : markdown;
  const blob = new Blob([content], {
    type: isHtml ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}.${isHtml ? 'html' : 'md'}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
