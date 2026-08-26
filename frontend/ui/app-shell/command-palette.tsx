'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CornerDownLeft,
  FilePlus2,
  House,
  Link2,
  ListPlus,
  Receipt,
  Search,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/frontend/ui/primitives/command';
import { APP_PRODUCTS } from './constants';

interface PaletteItem {
  id: string;
  label: string;
  group: 'apps' | 'quick' | 'general';
  href: string;
  icon: typeof House;
}

const GENERAL_ITEMS: PaletteItem[] = [
  { id: 'home', label: 'الرَّئيسيَّة', group: 'general', href: '/', icon: House },
  { id: 'blog', label: 'المدوَّنة', group: 'general', href: '/blog', icon: BookOpen },
];

const QUICK_ACTIONS: PaletteItem[] = [
  {
    id: 'quick-blogpress',
    label: 'إنشاء مقالة',
    group: 'quick',
    href: '/blogpress/app?create=1',
    icon: FilePlus2,
  },
  {
    id: 'quick-habitflow',
    label: 'إضافة عادة',
    group: 'quick',
    href: '/habitflow/app?create=1',
    icon: ListPlus,
  },
  {
    id: 'quick-spendtrack',
    label: 'تسجيل مصروف',
    group: 'quick',
    href: '/spendtrack/app?create=1',
    icon: Receipt,
  },
  {
    id: 'quick-linksnap',
    label: 'اختصار رابط',
    group: 'quick',
    href: '/linksnap/app?create=1',
    icon: Link2,
  },
];

interface CommandPaletteProps {
  enableHotkey?: boolean;
}

export function CommandPalette({ enableHotkey = true }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!enableHotkey) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enableHotkey]);

  const run = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="البحث السَّريع"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-neutral-700 dark:text-neutral-200 transition-all duration-200 ease-out hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 active:scale-95 active:bg-neutral-200/80 dark:active:bg-neutral-700/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/80 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950 motion-reduce:transition-none"
      >
        <span className="sr-only">البحث السَّريع</span>
        <Search size={22} />
      </button>

      {/* Command Palette Modal */}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="البحث السَّريع"
        description="تنقَّل بسرعة بين المنتجات والصَّفحات"
      >
        {/* Search Input */}
        <div className="relative border-b border-border/40 px-2">
          <CommandInput
            placeholder="اكتب للبحث في المنتجات والصَّفحات…"
            className="h-12 border-0 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:ring-0 focus:outline-none"
          />
        </div>

        {/* Command Results List */}
        <CommandList className="max-h-90 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-rounded">
          {/* Empty State */}
          <CommandEmpty className="py-10 text-center text-sm">
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Search className="size-8 stroke-[1.5] text-muted-foreground/30" />
              <p className="font-semibold text-foreground/80">لم يتمَّ العثور على نتائج</p>
              <p className="text-xs text-muted-foreground/60">
                جرِّب البحث عن كلمات أخرى مثل "مدوَّنة" أو "شهادة"
              </p>
            </div>
          </CommandEmpty>

          {/* Apps Section */}
          <CommandGroup
            heading="التَّطبيقات"
            className="p-1 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground/70"
          >
            {APP_PRODUCTS.map((product) => {
              const Icon = product.icon;
              return (
                <CommandItem
                  key={product.id}
                  value={`app-${product.label}`}
                  onSelect={() => run(product.appPath)}
                  className="group relative flex min-h-12 cursor-pointer select-none items-center gap-3.5 rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-150 ease-out data-[selected=true]:bg-accent/80 data-[selected=true]:text-accent-foreground hover:bg-accent/60 active:scale-[0.995]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/60 dark:bg-neutral-800/60 shadow-2xs transition-all duration-200 group-hover:scale-105 group-data-[selected=true]:scale-105 group-data-[selected=true]:border-primary/40 group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-primary">
                    <Icon className="size-4 text-foreground/80 group-data-[selected=true]:text-primary transition-colors" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground group-data-[selected=true]:text-accent-foreground">
                    {product.label}
                  </span>
                  <span className="flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[selected=true]:opacity-100 text-muted-foreground/60 group-data-[selected=true]:text-primary">
                    <kbd className="hidden sm:inline-block font-mono text-[10px] text-muted-foreground/50">
                      فتح
                    </kbd>
                    <CornerDownLeft className="size-3.5 shrink-0" />
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator className="my-1.5 h-px bg-border/40" />

          {/* Quick Actions Section */}
          <CommandGroup
            heading="إجراءات سريعة"
            className="p-1 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground/70"
          >
            {QUICK_ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  value={`quick-${item.label}`}
                  onSelect={() => run(item.href)}
                  className="group relative flex min-h-11 cursor-pointer select-none items-center gap-3.5 rounded-xl px-3 py-2 text-sm outline-none transition-all duration-150 ease-out data-[selected=true]:bg-accent/80 data-[selected=true]:text-accent-foreground hover:bg-accent/60 active:scale-[0.995]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/60 dark:bg-neutral-800/60 shadow-2xs transition-all duration-200 group-hover:scale-105 group-data-[selected=true]:scale-105 group-data-[selected=true]:border-primary/40 group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-primary">
                    <Icon className="size-4 text-foreground/80 group-data-[selected=true]:text-primary transition-colors" />
                  </span>
                  <span className="flex-1 truncate text-sm font-medium tracking-tight text-foreground group-data-[selected=true]:text-accent-foreground">
                    {item.label}
                  </span>
                  <span className="flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[selected=true]:opacity-100 text-muted-foreground/60 group-data-[selected=true]:text-primary">
                    <CornerDownLeft className="size-3.5 shrink-0" />
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator className="my-1.5 h-px bg-border/40" />

          {/* General Section */}
          <CommandGroup
            heading="عام"
            className="p-1 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[11px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wider **:[[cmdk-group-heading]]:text-muted-foreground/70"
          >
            {GENERAL_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  value={`general-${item.id}`}
                  onSelect={() => run(item.href)}
                  className="group relative flex min-h-11 cursor-pointer select-none items-center gap-3.5 rounded-xl px-3 py-2 text-sm outline-none transition-all duration-150 ease-out data-[selected=true]:bg-accent/80 data-[selected=true]:text-accent-foreground hover:bg-accent/60 active:scale-[0.995]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/60 dark:bg-neutral-800/60 shadow-2xs transition-all duration-200 group-hover:scale-105 group-data-[selected=true]:scale-105 group-data-[selected=true]:border-primary/40 group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-primary">
                    <Icon className="size-4 text-foreground/80 group-data-[selected=true]:text-primary transition-colors" />
                  </span>
                  <span className="flex-1 truncate text-sm font-medium tracking-tight text-foreground group-data-[selected=true]:text-accent-foreground">
                    {item.label}
                  </span>
                  <span className="flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[selected=true]:opacity-100 text-muted-foreground/60 group-data-[selected=true]:text-primary">
                    <CornerDownLeft className="size-3.5 shrink-0" />
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>

        {/* Keyboard Navigation Footer Bar */}
        <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground/70 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border/60 bg-background/80 px-1 py-0.5 font-mono text-[10px] shadow-2xs">
                ↑
              </kbd>
              <kbd className="rounded border border-border/60 bg-background/80 px-1 py-0.5 font-mono text-[10px] shadow-2xs">
                ↓
              </kbd>
              <span>للتَّنقُّل</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">
                ↵
              </kbd>
              <span>للاختيار</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">
              ESC
            </kbd>
            <span>للإغلاق</span>
          </div>
        </div>
      </CommandDialog>
    </>
  );
}
