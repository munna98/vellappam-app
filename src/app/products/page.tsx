// src/app/products/page.tsx
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

// This is a Server Component, so it can directly access the database via Prisma
import prisma from '@/lib/prisma';

async function getProducts() {
  // Fetch products from the database
  const products = await prisma.product.findMany({
    orderBy: {
      name: 'asc', // Order by product name
    },
  });
  return products;
}

export default async function ProductsPage() {
  const products = await getProducts();

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
      <Suspense fallback={<div>Loading products...</div>}>
        <ProductTable products={products} />
      </Suspense>
    </div>
  );
}

// A separate component for the table to keep the main page component clean
function ProductTable({ products }: { products: any[] }) {
  if (products.length === 0) {
    return <p>No products found. Add a new product to get started!</p>;
  }

  return (
    <Table>
      <TableCaption>A list of your firm's products.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Product Code</TableHead>
          <TableHead>Product Name</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell className="font-medium">{product.code}</TableCell>
            <TableCell>{product.name}</TableCell>
            <TableCell>₹{product.price.toFixed(2)}</TableCell>
            <TableCell>{product.unit}</TableCell>
            <TableCell className="text-right">
              {/* You can add a link to a view/edit page here later */}
              <Button variant="outline" size="sm" disabled>
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}