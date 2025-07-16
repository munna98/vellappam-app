// src/app/api/payments/next-number/route.ts
import { NextResponse } from 'next/server';
import { generateNextPaymentNumber } from '@/lib/payment-utils'; // Import the utility

export async function GET() {
  try {
    const nextNumber = await generateNextPaymentNumber();
    return NextResponse.json({ nextNumber });
  } catch (error) {
    console.error('Error generating next payment number:', error);
    return NextResponse.json({ error: 'Failed to generate next payment number' }, { status: 500 });
  }
}