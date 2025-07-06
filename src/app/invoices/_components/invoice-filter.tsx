// src/app/invoices/_components/invoice-filter.tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InvoiceStatus } from '@prisma/client'; // Ensure this enum is imported

interface InvoiceFilterProps {
  currentStatus?: InvoiceStatus;
}

export function InvoiceFilter({ currentStatus }: InvoiceFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    router.push(`/invoices?${params.toString()}`);
  };

  return (
    <div className="flex justify-end mb-4">
      <Select
        onValueChange={handleStatusChange}
        value={currentStatus || 'ALL'}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Statuses</SelectItem>
          {Object.values(InvoiceStatus).map((status) => (
            <SelectItem key={status} value={status}>
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}