// src/app/reports/customer-ledger/components/CustomerLedgerFilters.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Calendar, User } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';

type Customer = {
  id: string;
  name: string;
  code: string;
};

interface CustomerLedgerFiltersProps {
  customers: Customer[];
  customerId: string;
  fromDate: string;
  toDate: string;
}

export default function CustomerLedgerFilters({
  customers,
  customerId,
  fromDate,
  toDate,
}: CustomerLedgerFiltersProps) {
  const router = useRouter();
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId);
  const [selectedFromDate, setSelectedFromDate] = useState(fromDate);
  const [selectedToDate, setSelectedToDate] = useState(toDate);

  const handleGenerateReport = () => {
    if (!selectedCustomerId) {
      return;
    }
    
    const params = new URLSearchParams({
      customerId: selectedCustomerId,
      fromDate: selectedFromDate,
      toDate: selectedToDate,
    });
    
    router.push(`/reports/customer-ledger?${params.toString()}`);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
      {/* Customer Selection */}
      <div className="w-full sm:w-auto">
        <div className="flex items-center gap-2 mb-2 sm:mb-0 sm:hidden">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Customer</span>
        </div>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <div className="w-full sm:min-w-[250px]">
            <Combobox
              items={customers}
              value={selectedCustomerId || null}
              onSelect={(id) => setSelectedCustomerId(id || '')}
              placeholder="Select a customer..."
              emptyMessage="No customer found."
              searchPlaceholder="Search customers..."
              displayKey="name"
              valueKey="id"
              formatItemLabel={(customer: Customer) =>
                `${customer.name} (${customer.code})`
              }
            />
          </div>
        </div>
      </div>
      
      {/* Date Range Selection */}
      <div className="w-full sm:w-auto">
        <div className="flex items-center gap-2 mb-2 sm:mb-0 sm:hidden">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Date Range</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <input
            type="date"
            value={selectedFromDate}
            onChange={(e) => setSelectedFromDate(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2 border border-input rounded-md text-sm"
            required
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={selectedToDate}
            onChange={(e) => setSelectedToDate(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2 border border-input rounded-md text-sm"
            required
          />
        </div>
      </div>
      
      {/* Generate Report Button */}
      <Button
        onClick={handleGenerateReport}
        disabled={!selectedCustomerId}
        className="w-full sm:w-auto text-sm"
      >
        Generate Report
      </Button>
    </div>
  );
}