// src/app/api/products/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/products
// Can accept query params for ordering and limiting
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderBy = searchParams.get('orderBy') || 'name';
    const direction = searchParams.get('direction') || 'asc';
    const limit = searchParams.get('limit');

    const findManyArgs: any = {
      orderBy: {
        [orderBy]: direction,
      },
    };

    if (limit) {
      findManyArgs.take = parseInt(limit, 10);
    }

    const products = await prisma.product.findMany(findManyArgs);
    return NextResponse.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// POST /api/products (No changes needed here unless you want to add more validation)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, code, price, unit } = body;

    if (!name || !code || !price || !unit) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const newProduct = await prisma.product.create({
      data: {
        name,
        code,
        price: parseFloat(price),
        unit,
      },
    });
    return NextResponse.json(newProduct, { status: 201 });
  } catch (error: any) {
    console.error('Error creating product:', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('code')) {
      return NextResponse.json({ error: 'Product code already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}