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
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { DeleteProductButton } from './_components/delete-product-button'; 

async function getProducts() {
  const products = await prisma.product.findMany({
    orderBy: {
      name: 'asc',
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

function ProductTable({ products }: { products: any[] }) {
  if (products.length === 0) {
    return <p>No products found. Add a new product to get started!</p>;
  }

  return (
    <Table>
      <TableCaption>A list of your available products.</TableCaption>
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
                <DeleteProductButton productId={product.id} productName={product.name} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}