// src/app/invoices/[id]/edit/page.tsx
import { Suspense } from 'react';
import { Invoice, Customer, Product, InvoiceItem as PrismaInvoiceItem } from '@prisma/client';
import prisma from '@/lib/prisma';
import { EditInvoiceForm } from './_components/edit-invoice-form'; // New client component
import { InvoiceItem } from '@/store/invoice-store'; // Import the Zustand store's InvoiceItem type

// Define a more comprehensive type for the invoice data we'll fetch
interface FullInvoice extends Invoice {
  customer: Customer;
  items: (PrismaInvoiceItem & { product: Product })[];
}

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
  });
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

  // Transform Prisma InvoiceItems into Zustand InvoiceItem format
  const initialInvoiceItems: InvoiceItem[] = invoice.items.map(item => ({
    id: item.id, // Keep the ID for updates
    productId: item.productId,
    productName: item.product.name,
    productCode: item.product.code,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    total: item.total,
  }));

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Edit Invoice: {invoice.invoiceNumber}</h1>
      <Suspense fallback={<div>Loading form...</div>}>
        <EditInvoiceForm
          invoice={invoice}
          initialItems={initialInvoiceItems}
        />
      </Suspense>
    </div>
  );
}