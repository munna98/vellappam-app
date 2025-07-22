// src/app/api/customers/next-code/route.ts
import { NextResponse } from 'next/server';
import { generateNextCustomerCode } from '@/lib/customer-utils';

export async function GET() {
  try {
    const nextCode = await generateNextCustomerCode();
    return NextResponse.json({ nextCode });
  } catch (error) {
    console.error('Error generating next customer code:', error);
    return NextResponse.json({ error: 'Failed to generate next customer code' }, { status: 500 });
  }
}