'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/frontend/ui/primitives/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/ui/primitives/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/frontend/ui/primitives/sheet';
import { useIsMobile } from '@/frontend/ui/shared/use-is-mobile';

export interface SearchableOption {
  value: string;
  label: string;
  /** Extra terms the search should match; defaults to the label. */
  keywords?: string[];
}

interface SearchableSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Heading shown in the mobile bottom sheet. */
  sheetTitle?: string;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}

const LIST_CLASSNAME = 'max-h-[min(58vh,22rem)]';

interface OptionListProps {
  value: string;
  options: SearchableOption[];
  onSelect: (value: string) => void;
  searchPlaceholder: string;
  emptyMessage: string;
}

/**
 * The searchable, scrollable option list. Shared by the desktop popover and the
 * mobile bottom sheet — the two only differ in their chrome.
 */
function OptionList({
  value,
  options,
  onSelect,
  searchPlaceholder,
  emptyMessage,
}: OptionListProps) {
  return (
    <Command
      dir="rtl"
      defaultValue={value}
      className="rounded-none border-0 bg-transparent shadow-none"
    >
      <CommandInput placeholder={searchPlaceholder} className="h-12" />
      <CommandList className={LIST_CLASSNAME}>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <CommandItem
                key={option.value}
                value={option.value}
                keywords={option.keywords ?? [option.label]}
                onSelect={() => onSelect(option.value)}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <Check
                  className={cn(
                    'text-primary size-4 shrink-0 transition-opacity duration-150',
                    isSelected ? 'opacity-100' : 'opacity-0'
                  )}
                  aria-hidden="true"
                />
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/**
 * A single-select combobox: a form-field trigger that opens a searchable,
 * scrollable list — a popover on desktop, a bottom sheet below `sm`. The Radix
 * `Select` cannot search and its viewport does not bound its height, so long
 * lists (currencies, countries) use this instead.
 */
export function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'اختر…',
  searchPlaceholder = 'ابحث…',
  emptyMessage = 'لا توجد نتائج مطابقة',
  sheetTitle = 'اختر من القائمة',
  'aria-label': ariaLabel,
  disabled,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const selected = options.find((option) => option.value === value);

  const handleSelect = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      id={id}
      role="combobox"
      dir="rtl"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        'group flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input/80 bg-background/80 px-4 text-sm font-medium text-foreground shadow-xs transition-safe duration-200 ease-out',
        'hover:border-ring/40 hover:bg-background hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        'active:scale-[0.995]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input/80',
        className
      )}
    >
      <span
        className={cn(
          'line-clamp-1 min-w-0 flex-1 text-start',
          !selected && 'text-muted-foreground'
        )}
      >
        {selected?.label ?? placeholder}
      </span>
      <ChevronsUpDown
        className="size-4 shrink-0 opacity-50 transition-transform duration-300 ease-out group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          hideClose
          className="gap-0 max-h-[85dvh] rounded-t-2xl p-0 sm:rounded-t-3xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>ابحث في القائمة ثم اختر عنصرًا.</SheetDescription>
          </SheetHeader>
          <OptionList
            value={value}
            options={options}
            onSelect={handleSelect}
            searchPlaceholder={searchPlaceholder}
            emptyMessage={emptyMessage}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0 sm:w-[var(--radix-popover-trigger-width)] sm:p-0"
      >
        <OptionList
          value={value}
          options={options}
          onSelect={handleSelect}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
        />
      </PopoverContent>
    </Popover>
  );
}
