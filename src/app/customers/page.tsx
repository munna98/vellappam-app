// src/app/customers/page.tsx
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
import { DeleteCustomerButton } from './_components/delete-customer-button'; // New component

async function getCustomers() {
  const customers = await prisma.customer.findMany({
    orderBy: {
      name: 'asc',
    },
  });
  return customers;
}

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Customers</h1>
        <Link href="/customers/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Customer
          </Button>
        </Link>
      </div>
      <Suspense fallback={<div>Loading customers...</div>}>
        <CustomerTable customers={customers} />
      </Suspense>
    </div>
  );
}

function CustomerTable({ customers }: { customers: any[] }) {
  if (customers.length === 0) {
    return <p>No customers found. Add a new customer to get started!</p>;
  }

  return (
    <Table>
      <TableCaption>A list of your registered customers.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead> {/* Display Code */}
          <TableHead>Customer Name</TableHead>
          <TableHead>Contact Person</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow key={customer.id}>
            <TableCell className="font-mono text-sm">{customer.code}</TableCell> {/* Display Code */}
            <TableCell className="font-medium">{customer.name}</TableCell>
            <TableCell>{customer.contactPerson || 'N/A'}</TableCell>
            <TableCell>{customer.phone || 'N/A'}</TableCell>
            <TableCell>₹{customer.balance.toFixed(2)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Link href={`/customers/${customer.id}/edit`}> {/* Link to edit page */}
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </Link>
                <DeleteCustomerButton customerId={customer.id} customerName={customer.name} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}