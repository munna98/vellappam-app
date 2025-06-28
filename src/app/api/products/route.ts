// src/app/api/products/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/products
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: {
        name: 'asc', // Order by product name
      },
    });
    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// POST /api/products
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, code, price, unit } = body;

    // Add validation for required fields
    if (!name || !code || price === undefined || unit === undefined) {
      return NextResponse.json({ error: 'Name, code, price and unit are required' }, { status: 400 });
    }

    const newProduct = await prisma.product.create({
      data: {
        name,
        code,
        price, 
        unit,
      },
    });
    return NextResponse.json(newProduct, { status: 201 });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}