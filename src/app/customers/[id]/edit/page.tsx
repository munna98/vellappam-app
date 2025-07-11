// src/app/customers/[id]/edit/page.tsx
import { Suspense } from 'react';
import { Customer } from '@prisma/client';
import prisma from '@/lib/prisma';
import { EditCustomerForm } from './_components/edit-customer-form'; // New client component

interface EditCustomerPageProps {
  params: {
    id: string;
  };
}

async function getCustomer(id: string): Promise<Customer | null> {
  return prisma.customer.findUnique({
    where: { id },
  });
}

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const customer = await getCustomer(params.id);

  if (!customer) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h1 className="text-3xl font-bold mb-4">Customer Not Found</h1>
        <p className="text-muted-foreground">The customer you are trying to edit does not exist.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Edit Customer: {customer.name}</h1>
      <Suspense fallback={<div>Loading form...</div>}>
        <EditCustomerForm customer={customer} />
      </Suspense>
    </div>
  );
}