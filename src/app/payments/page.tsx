// src/app/payments/page.tsx
'use client'; // ⭐ Make this a client component

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDebounce } from '@/lib/useDebounce'; // Assuming this utility exists
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { DeletePaymentButton } from './_components/delete-payment-button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

// Define the types for Payment and Allocation for better type safety
interface AllocatedInvoiceDisplay {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  invoiceTotal: number;
  invoicePaidAmount: number;
}

interface Payment {
  id: string;
  paymentNumber: string;
  paymentDate: string; // ISO string
  amount: number;
  notes: string | null;
  customerId: string;
  createdAt: string;
  updatedAt: string;
  customer: {
    name: string;
    phone: string | null;
  } | null;
  allocatedTo: AllocatedInvoiceDisplay[];
}

interface PaginationData {
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 10,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchPayments = async (page = 1, query = '') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        orderBy: 'createdAt', // Default sort by createdAt
        direction: 'desc',     // Default to descending (latest first)
        ...(query && { query }), // Add search query if it exists
      }).toString();

      const response = await fetch(`/api/payments?${params}`);
      const data = await response.json();

      if (response.ok) {
        setPayments(data.data); // ⭐ Access data.data
        setPagination(data.pagination);
      } else {
        console.error('Failed to fetch payments:', data.error);
        setPayments([]);
        setPagination({ total: 0, totalPages: 1, currentPage: 1, limit: 10 });
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
      setPayments([]);
      setPagination({ total: 0, totalPages: 1, currentPage: 1, limit: 10 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments(1, debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchPayments(page, debouncedSearchTerm);
    }
  };

  // Function to handle deletion, re-fetch data to reflect changes
  const handleDelete = () => {
    // A simple refresh after delete is often sufficient for pagination.
    // Or you can recalculate if it's the last item on a page.
    fetchPayments(pagination.currentPage, debouncedSearchTerm); 
  };

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(pagination.totalPages, start + maxVisible - 1);

    // Adjust start if end is limited by totalPages
    if (end - start + 1 < maxVisible && pagination.totalPages > maxVisible) {
      start = Math.max(1, pagination.totalPages - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={i === pagination.currentPage}
            onClick={() => handlePageChange(i)}
            className="cursor-pointer"
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    return pages;
  };

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

      <div className="mb-4">
        <Input
          placeholder="Search payments..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-lg text-muted-foreground mb-4">
            {searchTerm ? 'No payments match your search.' : 'No payments found.'}
          </p>
          <Link href="/payments/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Record New Payment
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
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
                    <TableCell className="text-right">₹{payment.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {payment.allocatedTo && payment.allocatedTo.length > 0 ? (
                        payment.allocatedTo.map((alloc: AllocatedInvoiceDisplay) => ( // ⭐ Typed alloc
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
                        <DeletePaymentButton paymentId={payment.id} paymentNumber={payment.paymentNumber} onDelete={handleDelete} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination.totalPages > 1 && (
            <>
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={pagination.currentPage === 1}
                      className="cursor-pointer"
                    >
                      <PaginationPrevious />
                    </button>
                  </PaginationItem>

                  {renderPageNumbers()}

                  <PaginationItem>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={pagination.currentPage === pagination.totalPages}
                      className="cursor-pointer"
                    >
                      <PaginationNext />
                    </button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <div className="text-sm text-muted-foreground text-center mt-2">
                Showing {(pagination.currentPage - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.currentPage * pagination.limit, pagination.total)} of{' '}
                {pagination.total} payments
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
