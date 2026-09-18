'use client';

import * as React from 'react';
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

import { COUNTRY_DIAL_CODES, DEFAULT_COUNTRY, type CountryDialCode } from './country-dial-codes';
import { BELOW_SM_MEDIA_QUERY } from './breakpoints';
import {
  composePhoneNumber,
  sanitizeTypedNational,
  splitStoredPhone,
  toNationalFromPaste,
} from './phone-utils';

interface CountryPhoneInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
}

/** Below Tailwind's `sm` breakpoint the picker surfaces as a bottom sheet. */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia(BELOW_SM_MEDIA_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isMobile;
}

const PICKER_LIST_CLASSNAME = 'max-h-[min(58vh,24rem)] sm:max-h-[min(64vh,26rem)]';

interface CountryPickerProps {
  selectedIso: string;
  onSelect: (country: CountryDialCode) => void;
}

/**
 * The scrollable, searchable country list. Rendered inside either the desktop
 * popover or the mobile bottom sheet — the two only differ in their chrome, so
 * the list itself is defined once.
 */
function CountryPicker({ selectedIso, onSelect }: CountryPickerProps) {
  return (
    <Command
      dir="rtl"
      defaultValue={selectedIso}
      className="rounded-none border-0 bg-transparent shadow-none backdrop-blur-none"
    >
      <CommandInput placeholder="ابحث عن الدَّولة أو رمز الاتِّصال..." className="h-12" />
      <CommandList className={PICKER_LIST_CLASSNAME}>
        <CommandEmpty>لا توجد نتائج مطابقة</CommandEmpty>
        <CommandGroup>
          {COUNTRY_DIAL_CODES.map((item) => {
            const selected = item.iso === selectedIso;
            return (
              <CommandItem
                key={item.iso}
                value={item.iso}
                keywords={[item.nameAr, item.dial, `+${item.dial}`]}
                onSelect={() => onSelect(item)}
                className="gap-2.5"
              >
                <span className="text-base leading-none" aria-hidden="true">
                  {item.flag}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.nameAr}</span>
                <span
                  dir="ltr"
                  className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
                >
                  +{item.dial}
                </span>
                <Check
                  className={cn(
                    'size-4 shrink-0 text-primary transition-opacity duration-150',
                    selected ? 'opacity-100' : 'opacity-0'
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

export function CountryPhoneInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  disabled,
  'aria-describedby': ariaDescribedBy,
}: CountryPhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState('');
  // Mirror the user's raw digits while they type so a trunk-leading "0" is
  // visible instead of being normalized away on each keystroke. The draft is
  // authoritative until blur, then dropped in favour of the canonical value.
  // We intentionally do not reconcile it against incoming `value` mid-typing,
  // so consumers may transform or debounce `onChange` without digits jumping.
  const [draftNational, setDraftNational] = React.useState<string | null>(null);
  const isMobile = useIsMobile();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const parsed = React.useMemo(() => splitStoredPhone(value), [value]);
  const country = parsed.country ?? DEFAULT_COUNTRY;
  const national = draftNational ?? parsed.national;

  const emit = (nextCountry: CountryDialCode, nextNational: string) => {
    onChange(composePhoneNumber(nextCountry.dial, nextNational));
  };

  const handleNationalChange = (raw: string) => {
    const next = sanitizeTypedNational(raw);
    setDraftNational(next);
    emit(country, next);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = toNationalFromPaste(event.clipboardData.getData('text'));
    const el = inputRef.current;
    if (!el) {
      setDraftNational(pasted);
      emit(country, pasted);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = sanitizeTypedNational(el.value.slice(0, start) + pasted + el.value.slice(end));
    const caret = Math.min(start + pasted.length, next.length);
    setDraftNational(next);
    emit(country, next);
    requestAnimationFrame(() => el.setSelectionRange(caret, caret));
  };

  const handleSelect = (nextCountry: CountryDialCode) => {
    emit(nextCountry, national);
    setOpen(false);
    setAnnouncement(`تمَّ اختيار ${nextCountry.nameAr} +${nextCountry.dial}`);
    // Desktop: hand focus back to the number field so typing continues instantly.
    if (!isMobile) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      aria-label={`رمز الدَّولة المُحدَّد: ${country.nameAr} (+${country.dial}). اضغط لتغيير الدَّولة`}
      aria-haspopup={isMobile ? 'dialog' : 'listbox'}
      className={cn(
        'flex h-full min-h-11 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-s-xl ps-3 pe-2.5',
        'text-sm font-medium text-foreground transition-colors duration-150 ease-out',
        'hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:hover:bg-transparent'
      )}
    >
      <span className="text-base leading-none" aria-hidden="true">
        {country.flag}
      </span>
      <span dir="ltr" className="font-mono tabular-nums tracking-tight">
        +{country.dial}
      </span>
      <ChevronsUpDown
        className={cn(
          'size-3.5 shrink-0 opacity-50 transition-transform duration-200 ease-out',
          open && 'rotate-180'
        )}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <div
      dir="ltr"
      className={cn(
        'flex h-11 w-full items-stretch overflow-hidden rounded-xl border bg-background/80 backdrop-blur-xs shadow-2xs',
        'transition-all duration-200 ease-out',
        'hover:border-ring/40 hover:bg-background hover:shadow-xs',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 focus-within:bg-background focus-within:shadow-xs',
        invalid
          ? 'border-destructive/70 bg-destructive/3 focus-within:border-destructive focus-within:ring-destructive/20'
          : 'border-input/80',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent
            side="bottom"
            className="gap-0 max-h-[85dvh] rounded-t-2xl p-0 sm:rounded-t-3xl"
          >
            <SheetHeader className="border-b border-border/40 px-5 pe-14 pb-3 pt-5 text-start">
              <SheetTitle className="text-base">اختر رمز الدَّولة</SheetTitle>
              <SheetDescription className="sr-only">
                ابحث عن الدَّولة بالاسم أو رمز الاتِّصال ثمَّ اخترها لإتمام رقمك.
              </SheetDescription>
            </SheetHeader>
            <CountryPicker selectedIso={country.iso} onSelect={handleSelect} />
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={6}
            collisionPadding={8}
            className="w-[min(19rem,calc(100vw-2rem))] p-0 sm:w-80 sm:p-0"
          >
            <CountryPicker selectedIso={country.iso} onSelect={handleSelect} />
          </PopoverContent>
        </Popover>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="my-2 w-px shrink-0 bg-border" aria-hidden="true" />

      <input
        id={id}
        name={name}
        ref={inputRef}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        spellCheck="false"
        dir="ltr"
        disabled={disabled}
        value={national}
        onChange={(e) => handleNationalChange(e.target.value)}
        onPaste={handlePaste}
        onBlur={() => {
          setDraftNational(null);
          onBlur?.();
        }}
        placeholder={placeholder}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={ariaDescribedBy}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm tracking-tight tabular-nums text-foreground outline-none selection:bg-primary/15 selection:text-primary placeholder:text-muted-foreground/60 disabled:cursor-not-allowed sm:text-base"
      />
    </div>
  );
}
