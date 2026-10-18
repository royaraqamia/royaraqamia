/**
 * The attribution the text licence requires (ADR-0057) and the one the
 * recitation licence requires (ADR-0062): each source named, linked, and the
 * terms stated. These are shipped surfaces rather than comments, so they belong
 * on every page that shows the text or offers the recitation.
 *
 * The recitation is credited to the reciter and to the network that publishes
 * it, because the permission we rely on is the network's grant and not the
 * reciter's alone.
 */
export function QuranAttribution() {
  return (
    <footer className="mt-12 space-y-2 border-t border-border/40 pt-5 text-center text-xs leading-relaxed text-muted-foreground">
      <p>
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
      </p>
      <p>
        والتِّلاوة بصوت الشَّيخ مشاري راشد العفاسي من{' '}
        <a
          href="https://alquran.cloud"
          target="_blank"
          rel="noreferrer noopener"
          className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          AlQuran Cloud
        </a>{' '}
        (Islamic Network)، كما نُشرت وبدون أيِّ تعديل.
      </p>
    </footer>
  );
}
