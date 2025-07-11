// src/app/customers/new/page.tsx
'use client';

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
import { useEffect, useState } from 'react';

// 1. Define your form schema using Zod
const formSchema = z.object({
  name: z.string().min(2, { message: 'Business Name is required.' }),
  code: z.string().min(1, { message: 'Customer Code is required.' }),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

// Helper function to generate next customer code (e.g., CUST1, CUST2)
const generateNextCustomerCode = (lastCode: string | null): string => {
  if (!lastCode) {
    return 'CUST1';
  }
  const match = lastCode.match(/^CUST(\d+)$/);
  if (match) {
    const lastNumber = parseInt(match[1], 10);
    return `CUST${lastNumber + 1}`;
  }
  return 'CUST1'; // Fallback if format is unexpected
};

export default function NewCustomerPage() {
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      contactPerson: '', // Default to empty string
      phone: '',         // Default to empty string
      address: '',       // Default to empty string
    },
  });

  const businessName = form.watch('name');

  // Effect to prefill contactPerson with businessName
  useEffect(() => {
    if (businessName && !form.formState.dirtyFields.contactPerson) {
      form.setValue('contactPerson', businessName, { shouldValidate: true });
    }
  }, [businessName, form]);

  // Effect to generate initial customer code on component mount
  useEffect(() => {
    const fetchLastCustomerCode = async () => {
      try {
        const response = await fetch('/api/customers?orderBy=createdAt&direction=desc&limit=1');
        const customers = await response.json();
        const lastCode = customers.length > 0 ? customers[0].code : null;
        const nextCode = generateNextCustomerCode(lastCode);
        form.setValue('code', nextCode);
      } catch (error) {
        console.error('Failed to fetch last customer code for auto-generation:', error);
        form.setValue('code', 'CUST1');
      }
    };
    fetchLastCustomerCode();
  }, [form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create customer');
      }

      toast.success('Customer created successfully!');
      router.push('/customers');
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error creating customer.');
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Add New Customer</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Business Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter business name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., CUST1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contactPerson"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Person</FormLabel>
                <FormControl>
                  <Input placeholder="Enter contact person's name" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input placeholder="Enter phone number" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input placeholder="Enter address" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Create Customer</Button>
        </form>
      </Form>
    </div>
  );
}