// src/lib/customer-utils.ts
import prisma from '@/lib/prisma';

export async function generateNextCustomerCode() {
  const lastCustomer = await prisma.customer.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });

  if (!lastCustomer || !lastCustomer.code) {
    return 'CUST1';
  }

  const match = lastCustomer.code.match(/^CUST(\d+)$/i);
  if (match) {
    const lastNumber = parseInt(match[1], 10);
    return `CUST${lastNumber + 1}`;
  }
  return 'CUST1'; // Fallback
}