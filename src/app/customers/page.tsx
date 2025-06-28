// src/app/customers/page.tsx
import { Suspense } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

// This is a Server Component, so it can directly access the database via Prisma
import prisma from "@/lib/prisma";

async function getCustomers() {
  // Fetch customers from the database
  const customers = await prisma.customer.findMany({
    orderBy: {
      createdAt: "desc", // Order by creation date
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

// A separate component for the table to keep the main page component clean
function CustomerTable({ customers }: { customers: any[] }) {
  if (customers.length === 0) {
    return <p>No customers found. Add a new customer to get started!</p>;
  }

  return (
    <Table>
      <TableCaption>A list of your registered customers.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Customer Code</TableHead>
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
            <TableCell >{customer.code}</TableCell>
            <TableCell className="font-medium">{customer.name}</TableCell>
            <TableCell>{customer.contactPerson || "N/A"}</TableCell>
            <TableCell>{customer.phone || "N/A"}</TableCell>
            <TableCell>₹{customer.balance.toFixed(2)}</TableCell>
            <TableCell className="text-right">
              <Link href={`/customers/${customer.id}`}>
                <Button variant="outline" size="sm">
                  View
                </Button>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
