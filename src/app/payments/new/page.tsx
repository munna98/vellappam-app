// src/app/payments/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Customer } from '@prisma/client';
import { Combobox } from '@/components/ui/combobox';

// Define form schema
const formSchema = z.object({
  customerId: z.string().min(1, { message: 'Customer is required.' }),
  amount: z.coerce.number().min(0.01, { message: 'Amount must be a positive number.' }),
  paymentDate: z.string().optional(), // Date string from input type="date"
  notes: z.string().optional(),
});

export default function NewPaymentPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  // REMOVED: selectedCustomerObject state is no longer needed for display

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: '',
      amount: 0,
      paymentDate: new Date().toISOString().split('T')[0], // Default to today's date
      notes: '',
    },
  });

  // Fetch customers for the combobox
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await fetch('/api/customers');
        if (!response.ok) {
          throw new Error('Failed to fetch customers');
        }
        const data: Customer[] = await response.json();
        setCustomers(data);
      } catch (error) {
        console.error('Error fetching customers:', error);
        toast.error('Failed to load customers.');
      }
    };
    fetchCustomers();
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process payment');
      }

      toast.success('Payment recorded and allocated successfully!');
      form.reset(); // Reset form fields
      // REMOVED: setSelectedCustomerObject(null);
      router.push('/payments'); // Redirect to payment list
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error processing payment.');
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Record New Payment</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer</FormLabel>
                <FormControl>
                  <Combobox
                    items={customers}
                    value={field.value}
                    onSelect={field.onChange} // Simpler, no need to update separate state
                    placeholder="Select a customer..."
                    emptyMessage="No customer found."
                    searchPlaceholder="Search customers..."
                    displayKey="name" // Still the primary key for search value
                    valueKey="id"
                    // NEW: Provide the formatting function
                    formatItemLabel={(customer: Customer) =>
                      `${customer.name} (Bal: ₹${customer.balance.toFixed(2)})`
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* REMOVED: Previous display of customer balance */}

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="Enter amount" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="paymentDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Input placeholder="Any payment notes" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Record Payment</Button>
        </form>
      </Form>
    </div>
  );
}