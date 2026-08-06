'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/frontend/shared/cn';

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  'aria-label': ariaLabel,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      aria-label={ariaLabel ?? 'اختر خيارًا'}
      className={cn(
        'group flex w-full items-center justify-between border border-input/80 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground shadow-xs backdrop-blur-sm transition-all duration-200 ease-out',
        'hover:border-ring/40 hover:bg-background hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-ring',
        'active:scale-[0.995]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/40 disabled:hover:border-input/80 disabled:hover:shadow-xs',
        'data-[size=sm]:h-9 data-[size=sm]:px-3 data-[size=sm]:text-xs data-[size=sm]:rounded-lg data-[size=sm]:gap-1.5',
        'data-[size=default]:h-11 data-[size=default]:px-4 data-[size=default]:text-sm data-[size=default]:rounded-xl data-[size=default]:gap-2',
        '[&>span]:line-clamp-1 [&>span]:flex [&>span]:items-center [&>span]:gap-2',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50 transition-transform duration-300 ease-out group-hover:opacity-80 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  position?: 'popper' | 'item-aligned';
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          'relative z-50 min-w-32 max-h-[--radix-select-content-available-height] origin-[--radix-select-content-transform-origin] overflow-hidden rounded-2xl border border-border/60 bg-popover/90 p-1 text-popover-foreground shadow-2xl backdrop-blur-xl transition-all',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 duration-200 ease-out',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1.5 data-[side=left]:-translate-x-1.5 data-[side=right]:translate-x-1.5 data-[side=top]:-translate-y-1.5',
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1 space-y-0.5',
            position === 'popper' &&
              'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1'
          )}
        >
          {React.Children.count(children) > 0 ? (
            React.Children.map(children, (child) => {
              if (React.isValidElement(child) && child.type === SelectItem) {
                const itemChild = child as React.ReactElement<ComponentProps<typeof SelectItem>>;
                return React.cloneElement(itemChild, {
                  className: cn('rounded-lg mx-0.5 my-0.5', itemChild.props.className),
                });
              }
              return child;
            })
          ) : (
            <div className="px-4 py-3 text-center text-xs font-medium text-muted-foreground/80">
              لا توجد خيارات متاحة
            </div>
          )}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        'px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase select-none',
        className
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'group relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg py-2 pr-8 pl-3 text-sm font-medium outline-none transition-colors duration-150 ease-out',
        'focus:bg-accent focus:text-accent-foreground',
        'data-[state=checked]:bg-accent/75 data-[state=checked]:text-accent-foreground data-[state=checked]:font-semibold',
        'data-disabled:pointer-events-none data-disabled:opacity-40',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground group-hover:[&_svg:not([class*='text-'])]:text-foreground",
        className
      )}
      {...props}
    >
      <span className="absolute right-2.5 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4 stroke-[2.5] text-primary transition-transform duration-200 ease-out data-[state=checked]:scale-100" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('bg-border/60 pointer-events-none -mx-1 my-1.5 h-px', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1.5 text-muted-foreground hover:text-foreground transition-colors duration-150',
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4 stroke-[2.5]" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1.5 text-muted-foreground hover:text-foreground transition-colors duration-150',
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4 stroke-[2.5]" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
