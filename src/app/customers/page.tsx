// src/app/customers/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react'; // ⭐ Import useCallback
import Link from 'next/link';
import { useDebounce } from '@/lib/useDebounce';
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
import { PlusCircle, Edit } from 'lucide-react';
import { DeleteCustomerButton } from './_components/delete-customer-button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface Customer {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  balance: number;
  createdAt: string;
}

interface PaginationData {
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 10,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // ⭐ Wrap fetchCustomers in useCallback to stabilize the function reference
  const fetchCustomers = useCallback(async (page = 1, search = '') => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(), // pagination.limit is stable after initial render or if it changes, this useCallback will re-memoize
        ...(search && { search }),
      }).toString();

      const response = await fetch(`/api/customers?${query}`);
      const data = await response.json();

      if (response.ok) {
        setCustomers(data.data);
        setPagination(data.pagination);
      } else {
        console.error('Failed to fetch customers:', data.error);
        setCustomers([]);
        setPagination({ total: 0, totalPages: 1, currentPage: 1, limit: 10 });
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
      setPagination({ total: 0, totalPages: 1, currentPage: 1, limit: 10 });
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit]); // ⭐ Add pagination.limit to the useCallback dependency array

  useEffect(() => {
    fetchCustomers(1, debouncedSearchTerm);
  }, [debouncedSearchTerm, fetchCustomers]); // ⭐ Add fetchCustomers to dependency array

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchCustomers(page, debouncedSearchTerm);
    }
  };

  const handleDelete = (deletedId: string) => {
    setCustomers(prev => prev.filter(c => c.id !== deletedId));

    const newTotal = pagination.total - 1;
    const newTotalPages = Math.ceil(newTotal / pagination.limit);
    let newCurrentPage = pagination.currentPage; // Use let as it might be reassigned

    // If the last item on the current page was deleted, and there are previous pages,
    // go to the previous page.
    if (customers.length === 1 && pagination.currentPage > 1) {
      newCurrentPage = pagination.currentPage - 1;
    }
    
    // Update pagination state
    setPagination(prev => ({
      ...prev,
      total: newTotal,
      totalPages: newTotalPages,
      currentPage: newCurrentPage,
    }));

    // Only re-fetch if the page changes or if we're on the last page and the last item was deleted
    // (meaning the current page is now empty and needs to show the previous page's data).
    // Or simply re-fetch for the current page if it's not changing, to update the list
    // if there are still items on the page.
    fetchCustomers(newCurrentPage, debouncedSearchTerm);
  };

  const renderPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, pagination.currentPage - Math.floor(maxVisible / 2)); // Calculate start dynamically
    const end = Math.min(pagination.totalPages, start + maxVisible - 1); // ⭐ Changed 'let end' to 'const end' if not reassigned

    // Adjust start if 'end' calculation causes fewer than maxVisible pages to show
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
        <h1 className="text-3xl font-bold">Customers</h1>
        <Link href="/customers/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add New Customer
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-lg text-muted-foreground mb-4">
            {searchTerm ? 'No customers match your search.' : 'No customers found.'}
          </p>
          <Link href="/customers/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Customer
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="rounded-md border mb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
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
                    <TableCell className="font-mono text-sm">{customer.code}</TableCell>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.contactPerson || 'N/A'}</TableCell>
                    <TableCell>{customer.phone || 'N/A'}</TableCell>
                    <TableCell>₹{customer.balance.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/customers/${customer.id}/edit`}>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <DeleteCustomerButton
                          customerId={customer.id}
                          customerName={customer.name}
                          onDelete={handleDelete}
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

              <div className="text-sm text-muted-foreground text-center mt-2">
                Showing {(pagination.currentPage - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.currentPage * pagination.limit, pagination.total)} of{' '}
                {pagination.total} customers
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}