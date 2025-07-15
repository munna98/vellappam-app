// src/app/payments/[id]/edit/_components/edit-payment-form.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Customer, Payment as PrismaPayment } from '@prisma/client'; // Removed Invoice and PaymentMethod
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FullPayment, AllocatedInvoiceDisplay } from '@/types'; // Import the new types

// Props now use FullPayment and AllocatedInvoiceDisplay
interface EditPaymentFormProps {
  payment: FullPayment; // Use FullPayment type here
  initialAllocations: AllocatedInvoiceDisplay[];
}

export function EditPaymentForm({ payment, initialAllocations }: EditPaymentFormProps) {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentNumber, setPaymentNumber] = useState<string>(payment.paymentNumber);
  const [paymentDate, setPaymentDate] = useState<string>(new Date(payment.paymentDate).toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(payment.amount);
  const [notes, setNotes] = useState(payment.notes || '');

  const [currentAllocations, setCurrentAllocations] = useState<AllocatedInvoiceDisplay[]>(initialAllocations);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const customersRes = await fetch('/api/customers');
        if (!customersRes.ok) {
          throw new Error('Failed to fetch customers.');
        }
        const customersData: Customer[] = await customersRes.json();
        setCustomers(customersData);
        setSelectedCustomer(customersData.find(c => c.id === payment.customerId) || null);
      } catch (error) {
        console.error('Error fetching customers:', error);
        toast.error('Failed to load customers.');
      }
    };
    fetchData();
  }, [payment.customerId]);

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
      const response = await fetch(`/api/payments/${payment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount,
          paymentDate,
          notes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update payment');
      }

      toast.success('Payment updated successfully!');
      router.push('/payments');
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error updating payment.');
    }
  };

  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-4xl mx-auto p-6 space-y-8">
        <CardContent className="p-0 space-y-6">
          {/* Payment Number and Date */}
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="paymentNumber">Payment Number</Label>
                <Input
                  id="paymentNumber"
                  value={paymentNumber}
                  className="w-[180px]"
                  disabled
                />
              </div>
            </div>
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-[2] w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="customer">Select Customer</Label>
                <Combobox
                  items={customers}
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
            <div className="space-y-2">
              {/* This column is now empty if paymentMethod removed, can collapse or use for notes */}
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

          <Separator />

          {/* Display Current Invoice Allocation (Read-Only) */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Current Allocations</h3>
            {currentAllocations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Total (₹)</TableHead>
                    <TableHead>Paid (before this payment) (₹)</TableHead>
                    <TableHead className="text-right">Allocated by This Payment (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentAllocations.map((alloc) => (
                    <TableRow key={alloc.invoiceId}>
                      <TableCell>{alloc.invoiceNumber}</TableCell>
                      <TableCell>₹{alloc.invoiceTotal.toFixed(2)}</TableCell>
                      <TableCell>₹{(alloc.invoicePaidAmount - alloc.allocatedAmount).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        ₹{alloc.allocatedAmount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p>This payment was not allocated to any specific invoices, or it was unallocated upon creation.</p>
            )}
            <p className="text-sm text-muted-foreground">
              Changing the payment amount will trigger a re-allocation on the server based on outstanding invoices (FIFO).
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => router.push('/payments')}>
              Cancel
            </Button>
            <Button onClick={handleSavePayment}>Save Changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}