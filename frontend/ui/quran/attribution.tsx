/**
 * The attribution the Tanzil licence requires (ADR-0057): the project named, a
 * link back to it, and the licence stated. It is a shipped surface rather than a
 * comment, so it belongs on every page that shows the text.
 */
export function QuranAttribution() {
  return (
    <footer className="mt-12 border-t border-border/40 pt-5 text-center text-xs leading-relaxed text-muted-foreground">
      النَّصُّ القرآنيُّ برواية حفصٍ عن عاصم من{' '}
      <a
        href="https://tanzil.net"
        target="_blank"
        rel="noreferrer noopener"
        className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
      >
        مشروع تنزيل
      </a>{' '}
      برخصة المشاع الإبداعي نَسب المُصنَّف 3.0، والنَّصُّ لم يُغيَّر.
    </footer>
  );
}
