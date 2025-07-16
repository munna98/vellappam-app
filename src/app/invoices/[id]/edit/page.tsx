// src/app/invoices/[id]/edit/page.tsx
import { Suspense } from 'react';
import prisma from '@/lib/prisma';
import { EditInvoiceForm } from './_components/edit-invoice-form';
import { FullInvoice } from '@/types'; // Import FullInvoice

interface EditInvoicePageProps {
  params: {
    id: string;
  };
}

async function getInvoice(id: string): Promise<FullInvoice | null> {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: true,
        },
      },
    },
  }) as FullInvoice | null; // Cast to FullInvoice type
}

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const invoice = await getInvoice(params.id);

  if (!invoice) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h1 className="text-3xl font-bold mb-4">Invoice Not Found</h1>
        <p className="text-muted-foreground">The invoice you are trying to edit does not exist.</p>
      </div>
    );
  }

  // Pass the invoice data, which now includes discountAmount and netAmount
  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Edit Invoice: {invoice.invoiceNumber}</h1>
      <Suspense fallback={<div>Loading form...</div>}>
        <EditInvoiceForm initialInvoice={invoice} />
      </Suspense>
    </div>
  );
}