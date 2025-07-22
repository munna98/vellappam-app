// src/lib/invoice-utils.ts
import prisma from '@/lib/prisma';

export async function generateNextInvoiceNumber(): Promise<string> {
  // Find the latest invoice to determine the next sequential number
  const latestInvoice = await prisma.invoice.findFirst({
    orderBy: {
      createdAt: 'desc', // Assuming invoices are created chronologically
    },
    select: {
      invoiceNumber: true,
    },
  });

  let nextNumber = 1; 

  if (latestInvoice && latestInvoice.invoiceNumber) {
    // Extract the number part from the latest invoice number (e.g., "INV123" -> 123)
    const match = latestInvoice.invoiceNumber.match(/^INV(\d+)$/);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      nextNumber = currentNumber + 1;
    }
  }

  return `INV${nextNumber}`;
}