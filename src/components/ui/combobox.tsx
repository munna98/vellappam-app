'use client';
import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface ComboboxProps<T> {
  id?: string;
  items: T[];
  value: string | null;
  onSelect: (value: string) => void;
  placeholder: string;
  emptyMessage: string;
  searchPlaceholder: string;
  displayKey: keyof T;
  valueKey: keyof T;
  formatItemLabel?: (item: T) => string;
}

export function Combobox<T extends { [key: string]: unknown }>({
  id,
  items,
  value,
  onSelect,
  placeholder,
  emptyMessage,
  searchPlaceholder,
  displayKey,
  valueKey,
  formatItemLabel,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);

  const selectedItemDisplay = value
    ? items.find((item) => String(item[valueKey]) === value)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          id={id ? `${id}-trigger` : undefined}
        >
          {selectedItemDisplay
            ? (formatItemLabel ? formatItemLabel(selectedItemDisplay) : String(selectedItemDisplay[displayKey]))
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} id={id} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => { // ⭐ FIX: Removed _index completely as it's not used
                const itemValue = String(item[valueKey]);
                const itemDisplay = formatItemLabel ? formatItemLabel(item) : String(item[displayKey]);

                return (
                  <CommandItem
                    key={itemValue}
                    // Use the display text for search functionality
                    value={itemDisplay}
                    onSelect={(currentValue) => {
                      // Find the item by matching the display text
                      const selectedItem = items.find(item => {
                        const display = formatItemLabel ? formatItemLabel(item) : String(item[displayKey]);
                        return display.toLowerCase() === currentValue.toLowerCase();
                      });

                      if (selectedItem) {
                        const selectedValue = String(selectedItem[valueKey]);
                        onSelect(selectedValue === value ? "" : selectedValue);
                      }
                      setOpen(false);
                    }}
                  >
                    {itemDisplay}
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        value === itemValue ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}