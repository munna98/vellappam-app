// src/app/invoices/page.tsx
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
import { InvoiceStatus } from '@prisma/client';
import { format } from 'date-fns';
import { InvoiceFilter } from './_components/invoice-filter';
import { DeleteInvoiceButton } from './_components/delete-invoice-button'; 

async function getInvoices(statusFilter?: InvoiceStatus) {
  const whereClause: { status?: InvoiceStatus } = {};
  if (statusFilter && Object.values(InvoiceStatus).includes(statusFilter)) {
    whereClause.status = statusFilter;
  }

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    include: {
      customer: {
        select: { name: true, phone: true },
      },
    },
    orderBy: {
      invoiceDate: 'desc',
    },
  });
  return invoices;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: { status?: InvoiceStatus };
}) {
  const statusFilter = searchParams?.status;
  const invoices = await getInvoices(statusFilter);

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <Link href="/invoices/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Invoice
          </Button>
        </Link>
      </div>

      <InvoiceFilter currentStatus={statusFilter} />

      <Suspense fallback={<div>Loading invoices...</div>}>
        <InvoiceTable invoices={invoices} />
      </Suspense>
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: any[] }) {
  if (invoices.length === 0) {
    return <p className="mt-4">No invoices found for the selected filter.</p>;
  }

  return (
    <Table className="mt-4">
      <TableCaption>A list of your firm's invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice #</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Total Amount</TableHead>
          <TableHead className="text-right">Paid Amount</TableHead> {/* New column */}
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
            <TableCell>{invoice.customer?.name || 'N/A'}</TableCell>
            <TableCell>{format(new Date(invoice.invoiceDate), 'PPP')}</TableCell>
            <TableCell className="text-right">₹{invoice.totalAmount.toFixed(2)}</TableCell>
            <TableCell className="text-right">₹{invoice.paidAmount.toFixed(2)}</TableCell> {/* Display paid amount */}
            <TableCell>
              <span
                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  invoice.status === 'PAID'
                    ? 'bg-green-100 text-green-800'
                    : invoice.status === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {invoice.status}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Link href={`/invoices/${invoice.id}/edit`}> {/* Link to edit page */}
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </Link>
                <DeleteInvoiceButton invoiceId={invoice.id} invoiceNumber={invoice.invoiceNumber} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}