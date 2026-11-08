import { BookOpen } from 'lucide-react';

export interface PostHeading {
  level: number;
  text: string;
  id: string;
}

/**
 * The post's sticky contents list.
 *
 * It is a component of its own so the post screen can be the parity page (#922):
 * the list is hidden below `lg`, and the app draws the phone layout, so the
 * reference component should not carry the desktop-only glyph into the pair.
 */
export function PostTableOfContents({ headings }: { headings: PostHeading[] }) {
  return (
    <aside
      className="max-lg:hidden lg:col-span-4 self-start sticky top-28"
      aria-label="فهرس المحتويات"
    >
      <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm transition-safe duration-300 hover:border-border/90 hover:shadow-md">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/40">
          <BookOpen className="size-4 text-primary shrink-0" aria-hidden="true" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            فهرس المحتويات
          </h4>
        </div>
        <nav className="space-y-1 max-h-[calc(100vh_-_200px)] overflow-y-auto pr-1 scrollbar-thin">
          {headings.map((h, i) => (
            <a
              key={i}
              href={`#${h.id}`}
              className={`group flex items-center gap-2 text-xs leading-relaxed rounded-lg px-2.5 py-2 transition-safe duration-200 hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
                h.level === 2
                  ? 'font-medium text-foreground/85 hover:text-primary'
                  : 'text-muted-foreground/75 pr-6 hover:text-primary'
              }`}
            >
              <span className="size-1.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary transition-colors shrink-0" />
              <span className="truncate">{h.text}</span>
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
