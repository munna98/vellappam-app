// src/app/api/payments/next-number/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Get the latest numeric ID (more efficient than parsing strings)
    const lastPayment = await prisma.payment.findFirst({
      select: { paymentNumericId: true },
      orderBy: { paymentNumericId: 'desc' },
    });

    const latestNumericId = lastPayment ? lastPayment.paymentNumericId : 0;
    return NextResponse.json({ nextNumber: `PAY${latestNumericId + 1}`, latestNumericId });
  } catch (error) {
    console.error('Error fetching next payment number:', error);
    return NextResponse.json(
      { error: 'Failed to fetch next payment number' },
      { status: 500 }
    );
  }
}