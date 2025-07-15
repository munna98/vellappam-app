// src/app/products/[id]/edit/page.tsx
import { Suspense } from 'react';
import { Product } from '@prisma/client';
import prisma from '@/lib/prisma';
import { EditProductForm } from './_components/edit-product-form'; // New client component

interface EditProductPageProps {
  params: {
    id: string;
  };
}

async function getProduct(id: string): Promise<Product | null> {
  return prisma.product.findUnique({
    where: { id },
  });
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const product = await getProduct(params.id);

  if (!product) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h1 className="text-3xl font-bold mb-4">Product Not Found</h1>
        <p className="text-muted-foreground">The product you are trying to edit does not exist.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Edit Product: {product.name}</h1>
      <Suspense fallback={<div>Loading form...</div>}>
        <EditProductForm product={product} />
      </Suspense>
    </div>
  );
}