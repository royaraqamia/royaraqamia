'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl backdrop-blur-2xl transition-all duration-200 ease-out',
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0 rounded-2xl border border-border/80 bg-popover/95 backdrop-blur-2xl shadow-2xl sm:max-w-xl max-w-[calc(100vw-2rem)] mx-auto">
        <Command className="**:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-2 **:[[cmdk-group]]:px-2.5 [&_[cmdk-input-wrapper]_svg]:size-4.5 **:[[cmdk-input]]:h-13 **:[[cmdk-item]]:px-3 **:[[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:size-4.5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className="flex items-center border-b border-border/60 px-4 focus-within:border-border/90 transition-colors duration-150"
    cmdk-input-wrapper=""
  >
    <SearchIcon className="mr-3 size-4.5 shrink-0 text-muted-foreground/60 transition-colors group-focus-within:text-foreground" />
    <CommandPrimitive.Input
      ref={ref}
      data-slot="command-input"
      className={cn(
        'flex h-13 w-full rounded-none bg-transparent py-3.5 text-sm font-medium outline-none text-foreground placeholder:text-muted-foreground/50 placeholder:font-normal disabled:cursor-not-allowed disabled:opacity-50 tracking-tight transition-colors',
        className
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    data-slot="command-list"
    className={cn(
      'max-h-85 sm:max-h-105 scroll-py-2 overflow-x-hidden overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent transition-all',
      className
    )}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    data-slot="command-empty"
    className={cn(
      'py-12 px-4 text-center text-sm font-medium text-muted-foreground/80 select-none flex flex-col items-center justify-center gap-2 rounded-xl bg-muted/20 my-2 mx-2 border border-dashed border-border/40',
      className
    )}
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    data-slot="command-group"
    className={cn(
      'text-foreground overflow-hidden p-1.5 **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-muted-foreground/60 select-none',
      className
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    data-slot="command-separator"
    className={cn('-mx-1.5 my-1.5 h-px bg-border/50', className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    data-slot="command-item"
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-all duration-150 ease-out data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40 data-[selected=true]:bg-accent/80 data-[selected=true]:text-accent-foreground data-[selected=true]:shadow-xs hover:bg-accent/50 active:scale-[0.995] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4 [&_svg]:text-muted-foreground/80 data-[selected=true]:[&_svg]:text-accent-foreground',
      className
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        'ml-auto text-[11px] tracking-widest text-muted-foreground/70 font-mono font-medium rounded-md bg-muted/70 px-1.5 py-0.5 border border-border/40 select-none shadow-2xs',
        className
      )}
      {...props}
    />
  );
};
CommandShortcut.displayName = 'CommandShortcut';

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
