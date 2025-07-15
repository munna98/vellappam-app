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
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { format } from 'date-fns';
import { DeletePaymentButton } from './_components/delete-payment-button';

async function getPayments() {
  const payments = await prisma.payment.findMany({
    include: {
      customer: {
        select: { name: true, phone: true },
      },
      paymentAllocations: {
        include: {
          invoice: {
            select: { invoiceNumber: true, id: true, totalAmount: true, paidAmount: true },
          },
        },
      },
    },
    orderBy: {
      paymentDate: 'desc',
    },
  });

  // Transform payments to flatten allocations for display
  const formattedPayments = payments.map(p => ({
    ...p,
    allocatedTo: p.paymentAllocations.map(pa => ({
      invoiceId: pa.invoice.id,
      invoiceNumber: pa.invoice.invoiceNumber,
      allocatedAmount: pa.allocatedAmount,
      invoiceTotal: pa.invoice.totalAmount,
      invoicePaidAmount: pa.invoice.paidAmount,
    }))
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

function PaymentTable({ payments }: { payments: any[] }) {
  if (payments.length === 0) {
    return <p className="mt-4">No payments found. Record a new payment to get started!</p>;
  }

  return (
    <Table className="mt-4">
      <TableCaption>A list of recorded payments.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Payment #</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Date</TableHead>
          {/* Removed Payment Method column */}
          <TableHead className="text-right">Amount (₹)</TableHead>
          <TableHead>Allocated Invoices</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell className="font-medium">{payment.paymentNumber}</TableCell>
            <TableCell>{payment.customer?.name || 'N/A'}</TableCell>
            <TableCell>{format(new Date(payment.paymentDate), 'PPP')}</TableCell>
            {/* Removed Payment Method cell */}
            <TableCell className="text-right">₹{payment.amount.toFixed(2)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {payment.allocatedTo && payment.allocatedTo.length > 0 ? (
                payment.allocatedTo.map((alloc: any) => (
                  <div key={alloc.invoiceId}>
                    {alloc.invoiceNumber} (₹{alloc.allocatedAmount.toFixed(2)})
                  </div>
                ))
              ) : (
                'None'
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Link href={`/payments/${payment.id}/edit`}>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </Link>
                <DeletePaymentButton paymentId={payment.id} paymentNumber={payment.paymentNumber} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}