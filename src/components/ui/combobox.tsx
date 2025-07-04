//src/components/ui/combobox.tsx

'use client';
import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface ComboboxProps<T> {
  items: T[];
  value: string | null;
  onSelect: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
  searchPlaceholder: string;
  displayKey: keyof T;
  valueKey: keyof T;
}

export function Combobox<T extends { [key: string]: any }>({
  items,
  value,
  onSelect,
  placeholder,
  emptyMessage,
  searchPlaceholder,
  displayKey,
  valueKey,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value
            ? items.find((item) => item[valueKey] === value)?.[displayKey]
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandEmpty>{emptyMessage}</CommandEmpty>
          <CommandGroup>
            {items.map((item) => (
              <CommandItem
                key={String(item[valueKey])}
                value={String(item[displayKey])}
                onSelect={() => {
                  onSelect(String(item[valueKey]));
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === item[valueKey] ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {item[displayKey]}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}