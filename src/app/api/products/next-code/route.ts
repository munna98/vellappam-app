// src/app/api/products/next-code/route.ts
import { NextResponse } from 'next/server';
import { generateNextProductCode } from '@/lib/product-utils';

export async function GET() {
  try {
    const nextCode = await generateNextProductCode();
    return NextResponse.json({ nextCode });
  } catch (error) {
    console.error('Error generating next product code:', error);
    return NextResponse.json({ error: 'Failed to generate next product code' }, { status: 500 });
  }
}