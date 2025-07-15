// src/app/payments/[id]/edit/page.tsx
import { Suspense } from 'react';
import prisma from '@/lib/prisma';
import { EditPaymentForm } from './_components/edit-payment-form';
import { FullPayment, AllocatedInvoiceDisplay } from '@/types'; // Import the new types

interface EditPaymentPageProps {
  params: {
    id: string;
  };
}

async function getPayment(id: string): Promise<FullPayment | null> {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      customer: true,
      paymentAllocations: {
        include: {
          invoice: true,
        },
      },
    },
  }) as FullPayment | null; // Cast to our custom FullPayment type
}

export default async function EditPaymentPage({ params }: EditPaymentPageProps) {
  const payment = await getPayment(params.id);

  if (!payment) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h1 className="text-3xl font-bold mb-4">Payment Not Found</h1>
        <p className="text-muted-foreground">The payment you are trying to edit does not exist.</p>
      </div>
    );
  }

  // Transform allocations to simply pass their data for display
  const initialAllocations: AllocatedInvoiceDisplay[] = payment.paymentAllocations.map(alloc => ({
    invoiceId: alloc.invoiceId,
    invoiceNumber: alloc.invoice.invoiceNumber,
    allocatedAmount: alloc.allocatedAmount,
    invoiceTotal: alloc.invoice.totalAmount,
    invoicePaidAmount: alloc.invoice.paidAmount,
  }));

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Edit Payment: {payment.paymentNumber}</h1>
      <Suspense fallback={<div>Loading form...</div>}>
        <EditPaymentForm
          payment={payment}
          initialAllocations={initialAllocations}
        />
      </Suspense>
    </div>
  );
}