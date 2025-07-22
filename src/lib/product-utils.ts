// src/lib/product-utils.ts
import prisma from '@/lib/prisma';

export async function generateNextProductCode() {
  const lastProduct = await prisma.product.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });

  if (!lastProduct || !lastProduct.code) {
    return '1';
  }

  // Try to parse the last code as a number
  const lastNumber = parseInt(lastProduct.code, 10);
  if (!isNaN(lastNumber)) {
    return `${lastNumber + 1}`;
  }
  
  // If last code wasn't a number, start from 1
  return '1';
}