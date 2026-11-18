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
 * Downloads a post as a Markdown file. Uses a Blob + anchor so there is no
 * server round-trip and the exported file matches the editor content.
 */
export async function downloadPostAsFile(title: string, markdown: string): Promise<void> {
  const fileName = slugifyFileName(title);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
