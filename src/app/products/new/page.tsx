// src/app/products/new/page.tsx
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
import { useEffect } from 'react'; // Import useEffect

// Define your form schema
const formSchema = z.object({
  name: z.string().min(2, { message: 'Product Name is required.' }),
  code: z.string().min(1, { message: 'Product Code is required.' }), // Code is required
  price: z.number().min(0.01, { message: 'Price must be a positive number.' }),
  unit: z.string().min(1, { message: 'Unit is required.' }),
});

// Helper function to generate next product code
const generateNextProductCode = (lastCode: string | null): string => {
  if (!lastCode) {
    return '1';
  }
  const lastNumber = parseInt(lastCode, 10);
  if (!isNaN(lastNumber)) {
    return `${lastNumber + 1}`;
  }
  return '1'; // Fallback if format is unexpected or not numeric
};

export default function NewProductPage() {
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '', // Will be set by useEffect
      price: 0.01, // Default to a valid price
      unit: 'pcs', // Default to a common unit
    },
  });

  // Effect to generate initial product code
  useEffect(() => {
    const fetchLastProductCode = async () => {
      try {
        const response = await fetch('/api/products?orderBy=createdAt&direction=desc&limit=1');
        const products = await response.json();
        const lastCode = products.length > 0 ? products[0].code : null;
        const nextCode = generateNextProductCode(lastCode);
        form.setValue('code', nextCode); // Set the generated code as default
      } catch (error) {
        console.error('Failed to fetch last product code for auto-generation:', error);
        form.setValue('code', '1'); // Fallback if API fails
      }
    };
    fetchLastProductCode();
  }, [form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create product');
      }

      toast.success('Product created successfully!');
      router.push('/products'); // Redirect to the product list
      router.refresh(); // Revalidate data
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error creating product.');
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Add New Product</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter product name" {...field} />
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
                <FormLabel>Product Code</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 1, 2, 3" {...field} />
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
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="Enter price"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                    value={field.value === 0 ? '' : field.value} // Handle 0 for initial empty input
                  />
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
                  <Input placeholder="e.g., pcs, kg, liter" {...field} />
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