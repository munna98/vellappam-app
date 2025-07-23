// src/app/invoices/[id]/edit/page.tsx
import { Suspense } from 'react';
import prisma from '@/lib/prisma';
import { EditInvoiceForm } from './_components/edit-invoice-form';
import { Prisma } from '@prisma/client';
import { FullInvoice } from '@/types';

interface EditInvoicePageProps {
  params: {
    id: string;
  };
}

const fullInvoiceWithRelations = Prisma.validator<Prisma.InvoiceDefaultArgs>()({
  include: {
    customer: true,
    items: {
      include: {
        product: true,
      },
    },
  },
});

type PrismaFullInvoice = Prisma.InvoiceGetPayload<typeof fullInvoiceWithRelations>;

async function getInvoice(id: string): Promise<PrismaFullInvoice | null> {
  try {
    const invoice = await prisma.invoice.findUnique({
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
    // ⭐ DEBUG: Log the fetched invoice and its items
    console.log('Server: Fetched Invoice (before passing to client):', invoice);
    console.log('Server: Fetched Invoice Items (before passing to client):', invoice?.items);

    return invoice as FullInvoice;
  } catch (error) {
    console.error(`Error fetching invoice ${id} from database:`, error);
    return null;
  }
}

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const invoice = await getInvoice(params.id);

  if (!invoice) {
    // ... (rest of your invoice not found logic)
    return (
      <div className="container mx-auto py-10 text-center">
        <h1 className="text-3xl font-bold mb-4">Invoice Not Found</h1>
        <p className="text-muted-foreground">The invoice you are trying to edit does not exist or an error occurred.</p>
      </div>
    );
  }

  // ⭐ DEBUG: Log the invoice just before rendering the client component
  console.log('Server: Invoice passed to EditInvoiceForm:', invoice);


  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Edit Invoice: {invoice.invoiceNumber}</h1>
      <Suspense fallback={<div>Loading form...</div>}>
        <EditInvoiceForm initialInvoice={invoice} />
      </Suspense>
    </div>
  );
}