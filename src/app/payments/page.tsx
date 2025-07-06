// src/app/payments/page.tsx
import { Suspense } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { format } from 'date-fns';

async function getPayments() {
  const payments = await prisma.payment.findMany({
    include: {
      customer: {
        select: { name: true, phone: true },
      },
      // Now include paymentAllocations instead of direct invoice relation
      paymentAllocations: {
        include: {
          invoice: {
            select: { invoiceNumber: true, id: true }, // Select necessary invoice details
          },
        },
      },
    },
    orderBy: {
      paymentDate: 'desc',
    },
  });

  // Transform the data to flatten payment allocations for easier rendering
  const formattedPayments = payments.map(payment => ({
    ...payment,
    allocatedInvoices: payment.paymentAllocations.map(pa => ({
      invoiceId: pa.invoice.id,
      invoiceNumber: pa.invoice.invoiceNumber,
      allocatedAmount: pa.allocatedAmount,
    })),
  }));

  return formattedPayments;
}

export default async function PaymentsPage() {
  const payments = await getPayments();

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Payments</h1>
        <Link href="/payments/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Record New Payment
          </Button>
        </Link>
      </div>

      <Suspense fallback={<div>Loading payments...</div>}>
        <PaymentTable payments={payments} />
      </Suspense>
    </div>
  );
}

function PaymentTable({ payments }: { payments: any[] }) { // Using 'any' for simplicity due to nested objects
  if (payments.length === 0) {
    return <p className="mt-4">No payments recorded yet.</p>;
  }

  return (
    <Table className="mt-4">
      <TableCaption>A list of all recorded payments and their allocations.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Payment #</TableHead>
          <TableHead>Payment Date</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Allocated To</TableHead> {/* New column for allocations */}
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell className="font-medium">{payment.paymentNumber}</TableCell>
            <TableCell>{format(new Date(payment.paymentDate), 'PPP')}</TableCell>
            <TableCell>{payment.customer?.name || 'N/A'}</TableCell>
            <TableCell className="text-right">₹{payment.amount.toFixed(2)}</TableCell>
            <TableCell>
              {payment.allocatedInvoices && payment.allocatedInvoices.length > 0 ? (
                <div className="space-y-1">
                  {payment.allocatedInvoices.map((alloc: any, index: number) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <Link href={`/invoices/${alloc.invoiceId}`} className="text-blue-600 hover:underline">
                        Inv #{alloc.invoiceNumber}
                      </Link>
                      <span className="font-semibold ml-2">₹{alloc.allocatedAmount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                'No specific allocation'
              )}
            </TableCell>
            <TableCell>{payment.notes || 'N/A'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}