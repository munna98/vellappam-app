// src/app/products/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
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
import { DeleteProductButton } from './_components/delete-product-button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis // ⭐ Re-added PaginationEllipsis import
} from '@/components/ui/pagination';

interface Product {
  id: string;
  code: string;
  name: string;
  price: number;
  unit: string;
  createdAt: string;
}

interface PaginationData {
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 10,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const fetchProducts = useCallback(async (page = 1, search = '') => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
      }).toString();

      const response = await fetch(`/api/products?${query}`);
      const data = await response.json();

      if (response.ok) {
        setProducts(data.data);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      // Consider adding a toast error here for user feedback
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    fetchProducts(1, debouncedSearchTerm);
  }, [debouncedSearchTerm, fetchProducts]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchProducts(page, debouncedSearchTerm);
    }
  };

  const handleDelete = (deletedId: string) => {
    setProducts(prev => prev.filter(product => product.id !== deletedId));

    setPagination(prev => {
      const newTotal = prev.total - 1;
      const newTotalPages = Math.ceil(newTotal / prev.limit);
      // Adjust current page if the last item on a page was deleted
      const newCurrentPage = (prev.currentPage > newTotalPages && newTotalPages > 0)
        ? newTotalPages
        : prev.currentPage;

      // Re-fetch if the current page becomes empty after deletion and it's not the first page
      if (newTotal > 0 && products.length === 1 && prev.currentPage > 1) {
        // We call fetchProducts to get the data for the newCurrentPage
        // and ensure the UI reflects the correct state.
        fetchProducts(newCurrentPage, debouncedSearchTerm);
      } else if (newTotal === 0) { // If all items are deleted
        setProducts([]); // Ensure products array is empty
      }
      return {
        ...prev,
        total: newTotal,
        totalPages: newTotalPages,
        currentPage: newCurrentPage,
      };
    });
  };

  const renderPageNumbers = useCallback(() => { // ⭐ Wrap in useCallback
    const pages = [];
    const maxVisible = 5; // Max number of page buttons to show
    let startPage = Math.max(1, pagination.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxVisible - 1);

    // Adjust startPage if endPage is at totalPages but we haven't shown maxVisible pages
    if (endPage - startPage + 1 < maxVisible && pagination.totalPages > maxVisible) {
      startPage = Math.max(1, pagination.totalPages - maxVisible + 1);
      endPage = pagination.totalPages; // Ensure endPage is correctly set to totalPages
    }

    // Add ellipsis at the beginning if needed
    if (startPage > 1) {
      pages.push(
        <PaginationItem key="start-ellipsis">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    for (let i = startPage; i <= endPage; i++) {
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

    // Add ellipsis at the end if needed
    if (endPage < pagination.totalPages) {
      pages.push(
        <PaginationItem key="end-ellipsis">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    return pages;
  }, [pagination.currentPage, pagination.totalPages, handlePageChange]); // ⭐ Dependencies for useCallback


  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Products</h1>
        <Link href="/products/new">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Product
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-lg text-muted-foreground mb-4">
            {searchTerm ? 'No products match your search.' : 'No products found.'}
          </p>
          <Link href="/products/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Product
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
                  <TableHead>Product Name</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-sm">{product.code}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">₹{product.price.toFixed(2)}</TableCell>
                    <TableCell>{product.unit}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/products/${product.id}/edit`}>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <DeleteProductButton
                          productId={product.id}
                          productName={product.name}
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
                      aria-label="Previous page"
                    >
                      <PaginationPrevious />
                    </button>
                  </PaginationItem>

                  {renderPageNumbers()}

                  <PaginationItem>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={pagination.currentPage === pagination.totalPages}
                      aria-label="Next page"
                    >
                      <PaginationNext />
                    </button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <div className="text-sm text-muted-foreground mt-2">
                Showing {(pagination.currentPage - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.currentPage * pagination.limit, pagination.total)} of{' '}
                {pagination.total} products
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}