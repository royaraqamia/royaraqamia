'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, CornerDownLeft, House, ScanLine, Search } from 'lucide-react';
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
  group: 'apps' | 'general';
  href: string;
  icon: typeof House;
}

const GENERAL_ITEMS: PaletteItem[] = [
  { id: 'home', label: 'الصفحة الرئيسية', group: 'general', href: '/', icon: House },
  { id: 'blog', label: 'المدونة', group: 'general', href: '/blog', icon: BookOpen },
  { id: 'verify', label: 'التحقق من الشهادة', group: 'general', href: '/verify', icon: ScanLine },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const run = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 text-sm text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">بحث سريع…</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="البحث السريع"
        description="تنقّل بسرعة بين المنتجات والصفحات"
      >
        <CommandInput placeholder="اكتب للبحث في المنتجات والصفحات…" />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup heading="التطبيقات">
            {APP_PRODUCTS.map((product) => {
              const Icon = product.icon;
              return (
                <CommandItem
                  key={product.id}
                  value={`app-${product.label}`}
                  onSelect={() => run(product.appPath)}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold">{product.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {product.tagline}
                    </span>
                  </span>
                  <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground/60" />
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="عام">
            {GENERAL_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  value={`general-${item.id}`}
                  onSelect={() => run(item.href)}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground/60" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
