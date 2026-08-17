'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, UserRound, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/ui/primitives/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/frontend/ui/primitives/command';
import { Badge } from '@/frontend/ui/primitives/badge';
import { searchUsers } from '@/frontend/api/admin/users';
import type { AdminUser } from '@/shared/contracts/users';

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function userLabel(user: AdminUser): string {
  return user.name?.trim() || user.email;
}

interface UserSelectProps {
  id?: string;
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
}

export function UserSelect({
  id,
  value,
  onChange,
  label = 'المستلمون',
  placeholder = 'اختر المستخدمين...',
}: UserSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const debouncedQuery = useDebouncedValue(query);

  const selectedIds = useMemo(() => new Set(value), [value]);
  const byId = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  useEffect(() => {
    let mounted = true;
    searchUsers(debouncedQuery.trim())
      .then((results) => {
        if (mounted) setUsers(results);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [debouncedQuery]);

  function toggle(userId: string) {
    const next = new Set(value);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    onChange([...next]);
  }

  function remove(userId: string) {
    onChange(value.filter((id) => id !== userId));
  }

  return (
    <div className="form-field">
      {label && (
        <label htmlFor={id} className="form-label">
          {label}
        </label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            aria-expanded={open}
            className="bg-muted border-border text-foreground flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors duration-200 focus-ring hover:border-primary/40"
          >
            <span className="flex items-center gap-2 text-start">
              <UserRound className="text-muted-foreground size-4 shrink-0" />
              <span className={value.length > 0 ? '' : 'text-muted-foreground'}>
                {value.length > 0 ? `تم اختيار ${value.length} مستخدم` : placeholder}
              </span>
            </span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0"
          sideOffset={6}
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
            />
            <CommandList>
              <CommandEmpty>لا يوجد مستخدمون مطابقون</CommandEmpty>
              <CommandGroup>
                {users.map((user) => {
                  const selected = selectedIds.has(user.id);
                  return (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      onSelect={() => toggle(user.id)}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold">{userLabel(user)}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {user.name ? user.email : ''}
                        </span>
                      </span>
                      {selected && <Check className="text-primary size-4 shrink-0" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((userId) => {
            const user = byId.get(userId);
            const label = user ? userLabel(user) : `#${userId.slice(0, 8)}`;
            return (
              <Badge key={userId} variant="secondary" className="gap-1.5 pe-1 ps-2.5">
                {label}
                <button
                  type="button"
                  onClick={() => remove(userId)}
                  aria-label={`إزالة ${label}`}
                  className="text-muted-foreground hover:text-foreground focus-ring flex size-4 items-center justify-center rounded-full transition-colors duration-150"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
