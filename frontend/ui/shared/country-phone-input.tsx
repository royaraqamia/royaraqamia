'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';

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

import { COUNTRY_DIAL_CODES, DEFAULT_COUNTRY, type CountryDialCode } from './country-dial-codes';
import {
  composePhoneNumber,
  sanitizeTypedNational,
  splitStoredPhone,
  toNationalFromPaste,
} from './phone-utils';

interface CountryPhoneInputProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  invalid?: boolean;
}

export function CountryPhoneInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: CountryPhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  const parsed = React.useMemo(() => splitStoredPhone(value), [value]);
  const country = parsed.country ?? DEFAULT_COUNTRY;

  const emit = (nextCountry: CountryDialCode, national: string) => {
    onChange(composePhoneNumber(nextCountry.dial, national));
  };

  const handleNationalChange = (raw: string) => {
    emit(country, sanitizeTypedNational(raw));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    emit(country, toNationalFromPaste(event.clipboardData.getData('text')));
  };

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
          : 'border-input/80'
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="اختيار رمز الدولة"
          className="flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-l-xl px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent/50 min-h-11 focus-visible:outline-none"
        >
          <span aria-hidden="true">{country.flag}</span>
          <span className="font-mono tracking-tight">+{country.dial}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} dir="rtl" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="ابحث بالاسم أو الرمز..." className="h-11" />
            <CommandList>
              <CommandEmpty>لا توجد نتائج مطابقة</CommandEmpty>
              <CommandGroup>
                {COUNTRY_DIAL_CODES.map((item) => (
                  <CommandItem
                    key={item.iso}
                    value={`${item.nameAr} ${item.iso} +${item.dial}`}
                    onSelect={() => {
                      emit(item, parsed.national);
                      setOpen(false);
                    }}
                  >
                    <span aria-hidden="true">{item.flag}</span>
                    <span className="truncate">{item.nameAr}</span>
                    <span className="ms-auto font-mono text-xs text-muted-foreground">
                      +{item.dial}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="my-2 w-px shrink-0 bg-border" aria-hidden="true" />

      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        spellCheck="false"
        dir="ltr"
        value={parsed.national}
        onChange={(e) => handleNationalChange(e.target.value)}
        onPaste={handlePaste}
        placeholder={placeholder}
        aria-invalid={invalid ? 'true' : undefined}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm sm:text-base text-foreground tracking-tight outline-none placeholder:text-muted-foreground/60 selection:bg-primary/15 selection:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
