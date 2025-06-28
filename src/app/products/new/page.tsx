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

// Strict Zod schema 
const formSchema = z.object({
  name: z.string().min(2, { message: 'Product name is required.' }),
  code: z.string().min(1, { message: 'Product code is required.' }),
  price: z.coerce.number().min(0, { message: 'Price must be a positive number.' }),
  unit: z.string().min(1, { message: 'Unit is required.' }),
});

export default function NewProductPage() {
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      price: 0,
      unit: 'piece',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to create product');
      }

      toast.success('Product created successfully!');
      router.push('/products');
    } catch (error) {
      console.error(error);
      toast.error('Error creating product.');
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Add New Product</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., VLP, PTP" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Vallappam" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="Enter price" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., piece, dozen" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Create Product</Button>
        </form>
      </Form>
    </div>
  );
}
