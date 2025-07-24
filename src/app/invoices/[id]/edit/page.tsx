// src/app/invoices/[id]/edit/page.tsx
import { Suspense } from 'react';
import prisma from '@/lib/prisma';
import { EditInvoiceForm } from './_components/edit-invoice-form';
import { Prisma } from '@prisma/client';
// import { FullInvoice } from '@/types'; // This import might be redundant if PrismaFullInvoice is sufficient

// ⭐ FIX: Update EditInvoicePageProps to reflect that params is now a Promise
interface EditInvoicePageProps {
  params: Promise<{
    id: string;
  }>;
}

// ⭐ NOTE: Your PrismaFullInvoice type definition is excellent and correct for Prisma.
type PrismaFullInvoice = Prisma.InvoiceGetPayload<
  {
    include: {
      customer: true;
      items: {
        include: {
          product: true;
        };
      };
    };
  }
>;

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

    // Cast is fine here as Prisma.$include guarantees the shape
    return invoice as PrismaFullInvoice;
  } catch (error) {
    console.error(`Error fetching invoice ${id} from database:`, error);
    return null;
  }
}

// ⭐ FIX: Await params before destructuring
export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  // Await the params object to get the actual id value
  const resolvedParams = await params;
  const invoiceId = resolvedParams.id;

  const invoice = await getInvoice(invoiceId);

  if (!invoice) {
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