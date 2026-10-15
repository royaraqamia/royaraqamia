/**
 * The account action rows share one shape. `account-view` renders them and the
 * install section nests beneath one of them, so the string lives here rather
 * than being copied into both.
 */
export const rowClasses =
  'group flex w-full items-center justify-between gap-3 px-4 py-4 text-start text-sm sm:text-base font-bold text-foreground rounded-2xl border border-border/50 bg-card/60 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.99] transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

/** A child row inside an expanded account row — smaller, and without the border. */
export const subRowClasses =
  'group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start text-foreground transition-safe duration-150 ease-out hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';
