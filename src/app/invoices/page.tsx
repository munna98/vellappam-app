// src/app/invoices/page.tsx
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { InvoiceStatus } from "@prisma/client"; 
import { format } from "date-fns";
import prisma from "@/lib/prisma";
import { DeleteInvoiceButton } from "./_components/delete-invoice-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FullInvoice } from "@/types"; 

interface InvoiceListPageProps {
  searchParams: {
    customerId?: string;
    status?: InvoiceStatus;
    orderBy?: string;
    direction?: "asc" | "desc";
  };
}

async function getInvoices(
  searchParams: InvoiceListPageProps["searchParams"]
): Promise<FullInvoice[]> {
  const where: any = {};
  if (searchParams.customerId) {
    where.customerId = searchParams.customerId;
  }
  if (searchParams.status) {
    where.status = searchParams.status;
  }

  const orderBy: any = {
    [searchParams.orderBy || "invoiceDate"]: searchParams.direction || "desc",
  };

  const invoices = (await prisma.invoice.findMany({
    where,
    include: {
      customer: {
        select: { name: true },
      },
      items: {
        // Include items to show a summary if needed
        include: {
          product: {
            select: { name: true },
          },
        },
      },
    },
    orderBy,
  })) as FullInvoice[]; // Cast to FullInvoice

  return invoices;
}

export default async function InvoiceListPage({
  searchParams,
}: InvoiceListPageProps) {
  const invoices = await getInvoices(searchParams);

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <Button asChild>
          <Link href="/invoices/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Invoice
          </Link>
        </Button>
      </div>

      <Suspense fallback={<div>Loading invoices...</div>}>
        {invoices.length === 0 ? (
          <p className="text-center text-muted-foreground mt-8">
            No invoices found.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Subtotal (₹)</TableHead>
                  <TableHead className="text-right">
                    Discount (₹)
                  </TableHead>{" "}
                  {/* ⭐ New Column */}
                  <TableHead className="text-right">
                    Net Amount (₹)
                  </TableHead>{" "}
                  {/* ⭐ New Column */}
                  <TableHead className="text-right">Paid (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px] text-center">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.invoiceDate), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{invoice.customer.name}</TableCell>
                    <TableCell className="text-right">
                      ₹{invoice.totalAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{invoice.discountAmount.toFixed(2)}
                    </TableCell>{" "}
                    {/* ⭐ Display Discount */}
                    <TableCell className="text-right font-bold text-primary">
                      ₹{invoice.netAmount.toFixed(2)}
                    </TableCell>{" "}
                    {/* ⭐ Display Net Amount */}
                    <TableCell className="text-right">
                      ₹{invoice.paidAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.status === InvoiceStatus.PAID
                            ? "default"
                            : invoice.status === InvoiceStatus.PARTIAL
                            ? "outline"
                            : "destructive"
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-2 justify-center">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/invoices/${invoice.id}/edit`}>
                            Edit
                          </Link>
                        </Button>
                        <DeleteInvoiceButton
                          invoiceId={invoice.id}
                          invoiceNumber={invoice.invoiceNumber}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Suspense>
    </div>
  );
}
