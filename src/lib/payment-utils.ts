// src/lib/payment-utils.ts
import prisma from '@/lib/prisma';

export async function generateNextPaymentNumber(): Promise<string> {
  // Find the latest payment to determine the next sequential number
  const latestPayment = await prisma.payment.findFirst({
    orderBy: {
      createdAt: 'desc', // Assuming payments are created chronologically
    },
    select: {
      paymentNumber: true,
    },
  });

  let nextNumber = 1;

  if (latestPayment && latestPayment.paymentNumber) {
    // Extract the number part from the latest payment number (e.g., "PAY123" -> 123)
    const match = latestPayment.paymentNumber.match(/^PAY(\d+)$/);
    if (match && match[1]) {
      const currentNumber = parseInt(match[1], 10);
      nextNumber = currentNumber + 1;
    }
  }

  return `PAY${nextNumber}`;
}