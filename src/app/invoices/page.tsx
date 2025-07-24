// src/app/invoices/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react'; // ⭐ Add useCallback
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebounce } from '@/lib/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { PlusCircle } from 'lucide-react';
import { InvoiceStatus } from '@prisma/client';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { DeleteInvoiceButton } from './_components/delete-invoice-button';
import { toast } from 'sonner'; // Ensure toast is imported if used in catch blocks

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  invoiceDate: string;
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    name: string;
  };
}

interface PaginationData {
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

export default function InvoiceListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialSearch = searchParams.get('search') || '';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    totalPages: 1,
    currentPage: initialPage,
    limit: 10,
  });
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [isLoading, setIsLoading] = useState(true);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // ⭐ FIX: Wrap fetchInvoices with useCallback to make it stable
  const fetchInvoices = useCallback(async (page: number, search: string) => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
      }).toString();

      const response = await fetch(`/api/invoices?${query}`);
      const data = await response.json();

      if (response.ok) {
        setInvoices(data.data);
        setPagination(data.pagination);

        const newParams = new URLSearchParams();
        newParams.set('page', page.toString());
        if (search) {
          newParams.set('search', search);
        }
        router.push(`?${newParams.toString()}`, { scroll: false });
      } else {
        console.error('Failed to fetch invoices:', data.error);
        toast.error(`Failed to fetch invoices: ${data.error || 'Unknown error'}`); // Add toast for fetch errors
      }
    } catch (error: unknown) { // ⭐ FIX: Type caught error as unknown
      console.error('Error fetching invoices:', error);
      toast.error(error instanceof Error ? error.message : 'Error fetching invoices.'); // ⭐ FIX: Narrow error type
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit, router]); // pagination.limit and router are stable dependencies

  // ⭐ FIX: Add fetchInvoices to the dependency array
  useEffect(() => {
    fetchInvoices(pagination.currentPage, debouncedSearchTerm);
  }, [debouncedSearchTerm, pagination.currentPage, fetchInvoices]); // ⭐ FIX: Added fetchInvoices

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: page }));
    }
  };

  const handleDeleteInvoice = (deletedId: string) => {
    setInvoices(prev => prev.filter(inv => inv.id !== deletedId));

    const newTotal = pagination.total - 1;
    const newTotalPages = Math.ceil(newTotal / pagination.limit);
    let newCurrentPage = pagination.currentPage;

    // Adjust current page if the last invoice on a page was deleted
    if (invoices.length === 1 && pagination.currentPage > 1) {
      newCurrentPage = pagination.currentPage - 1;
    } else if (newTotal === 0) {
      newCurrentPage = 1; // If all invoices are deleted, reset to page 1
    }

    setPagination(prev => ({
      ...prev,
      total: newTotal,
      totalPages: newTotalPages,
      currentPage: newCurrentPage,
    }));

    // Only refetch if the page changed or if it was the last invoice (which implies page change to 1)
    if (newCurrentPage !== pagination.currentPage || newTotal === 0) {
      fetchInvoices(newCurrentPage, debouncedSearchTerm);
    } else {
      // If currentPage didn't change and there are still invoices,
      // a simple re-fetch of the current page is sufficient.
      // This ensures the table data reflects the deletion without changing page.
      fetchInvoices(pagination.currentPage, debouncedSearchTerm);
    }
  };


  const renderPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.currentPage - Math.floor(maxVisible / 2));
    // ⭐ FIX: Changed 'end' to 'const' as it's not reassigned within this scope
    const end = Math.min(pagination.totalPages, start + maxVisible - 1);

    // Adjust start if 'end' calculation results in fewer than maxVisible pages
    // when near the end of the total pages
    if (pagination.totalPages > maxVisible && end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
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
        <h1 className="text-3xl font-bold">Invoices</h1>
        <Button asChild>
          <Link href="/invoices/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Create New Invoice
          </Link>
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search invoices by number, customer name, or notes..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-lg text-muted-foreground mb-4">
            {searchTerm ? 'No invoices match your search.' : 'No invoices found.'}
          </p>
          <Link href="/invoices/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Create New Invoice
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-md border mb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Subtotal (₹)</TableHead>
                  <TableHead className="text-right">Discount (₹)</TableHead>
                  <TableHead className="text-right">Net Amount (₹)</TableHead>
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
                      {format(new Date(invoice.invoiceDate), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>{invoice.customer.name}</TableCell>
                    <TableCell className="text-right">
                      ₹{invoice.totalAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{invoice.discountAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      ₹{invoice.netAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{invoice.paidAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.status === InvoiceStatus.PAID
                            ? 'default'
                            : invoice.status === InvoiceStatus.PARTIAL
                            ? 'outline'
                            : 'destructive'
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
                          onDelete={handleDeleteInvoice}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination.totalPages > 1 && (
            <>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={pagination.currentPage === 1}
                    >
                      <PaginationPrevious />
                    </button>
                  </PaginationItem>

                  {renderPageNumbers()}

                  <PaginationItem>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={pagination.currentPage === pagination.totalPages}
                    >
                      <PaginationNext />
                    </button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <div className="text-sm text-muted-foreground mt-2 text-center">
                Showing{' '}
                {(pagination.currentPage - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.currentPage * pagination.limit, pagination.total)} of{' '}
                {pagination.total} invoices
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}