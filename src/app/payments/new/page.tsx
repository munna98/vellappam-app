// src/app/payments/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Customer } from '@prisma/client';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function CreatePaymentPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [nextPaymentNum, setNextPaymentNum] = useState('Loading...');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch customers
        const customersRes = await fetch('/api/customers');
        if (!customersRes.ok) {
          throw new Error('Failed to fetch customers.');
        }
        // ⭐ FIX: Assume /api/customers returns { data: Customer[] }
        const customersResponse = await customersRes.json();
        setCustomers(Array.isArray(customersResponse.data) ? customersResponse.data : []); // Ensure it's an array

        // Fetch next payment number from the new API endpoint
        const paymentNumRes = await fetch('/api/payments/next-number');
        if (!paymentNumRes.ok) {
          throw new Error('Failed to fetch next payment number.');
        }
        const { nextNumber } = await paymentNumRes.json();
        setNextPaymentNum(nextNumber);

      } catch (error) {
        console.error('Error fetching initial data for payments:', error);
        toast.error('Failed to load customers or payment number.');
        setNextPaymentNum('Error loading number');
        setCustomers([]); // Ensure customers is reset to an empty array on error
        // Removed: setInvoiceNumberDisplay and setProducts as they don't belong here
      }
    };
    fetchData();
  }, []); // Empty dependency array, runs once on mount

  const handleSavePayment = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer.');
      return;
    }
    if (amount <= 0) {
      toast.error('Payment amount must be greater than zero.');
      return;
    }

    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount,
          notes,
          // paymentDate is handled by backend or can be sent if needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save payment');
      }

      toast.success('Payment recorded successfully!');
      router.push('/payments');
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error saving payment.');
    }
  };

  const handleResetForm = () => {
    setSelectedCustomer(null);
    setAmount(0);
    setNotes('');
    // Optionally refetch next payment number if user resets the form
    const fetchNextNumOnReset = async () => {
      try {
        setNextPaymentNum('Loading...');
        const paymentNumRes = await fetch('/api/payments/next-number');
        if (paymentNumRes.ok) {
          const { nextNumber } = await paymentNumRes.json();
          setNextPaymentNum(nextNumber);
        } else {
          setNextPaymentNum('Error loading number');
        }
      } catch (error) {
        console.error('Error refetching next payment number:', error);
        setNextPaymentNum('Error loading number');
      }
    };
    fetchNextNumOnReset();
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Record New Payment</h1>
      <Card className="max-w-4xl mx-auto p-6 space-y-8">
        <CardContent className="p-0 space-y-6">
          {/* Payment Number and Date */}
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="paymentNumber">Payment Number</Label>
                <Input
                  id="paymentNumber"
                  value={nextPaymentNum}
                  className="w-[120px]"
                  disabled
                />
              </div>
            </div>
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={new Date().toISOString().split('T')[0]}
                  readOnly
                />
              </div>
            </div>
            <div className="flex-[2] w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="customer">Select Customer</Label>
                <Combobox
                  items={customers} // Now 'customers' will always be an array
                  value={selectedCustomer?.id || null}
                  onSelect={(id) =>
                    setSelectedCustomer(customers.find((c) => c.id === id) || null)
                  }
                  placeholder="Select a customer..."
                  emptyMessage="No customer found."
                  searchPlaceholder="Search customers..."
                  displayKey="name"
                  valueKey="id"
                  formatItemLabel={(customer: Customer) =>
                    `${customer.name} (Bal: ₹${customer.balance.toFixed(2)})`
                  }
                />
              </div>
            </div>
          </div>

          {selectedCustomer && (
            <div className="mt-2 p-4 border rounded-md bg-muted/50">
              <p className="font-semibold">{selectedCustomer.name}</p>
              <p className="text-sm text-muted-foreground">{selectedCustomer.address}</p>
              <p className="text-sm text-muted-foreground">Phone: {selectedCustomer.phone}</p>
              <p className="text-sm font-bold mt-2">Current Balance: ₹{selectedCustomer.balance.toFixed(2)}</p>
            </div>
          )}

          <Separator />

          {/* Payment Details */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="amount">Payment Amount</Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount === 0 ? '' : amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes for this payment..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={handleResetForm}>
              Reset Form
            </Button>
            <Button onClick={handleSavePayment}>Record Payment</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}