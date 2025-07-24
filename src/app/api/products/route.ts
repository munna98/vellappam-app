// src/app/api/products/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
// Import specific Prisma error type for better error handling
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
// Import Prisma namespace for generated types
import { Prisma } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;

    // Use Prisma.ProductWhereInput for type safety
    const where: Prisma.ProductWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { unit: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      data: products,
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, code, price, unit } = body;

    if (!name || !code || typeof price === 'undefined' || !unit) { // Changed !price to typeof price === 'undefined'
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    if (!/^\d+$/.test(code) || parseInt(code) <= 0) {
      return NextResponse.json({ error: 'Product code must be a positive number' }, { status: 400 });
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
  } catch (error) {
    console.error('Error creating product:', error);
    // Properly type the error to check for Prisma specific errors
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        if (error.meta?.target && Array.isArray(error.meta.target) && error.meta.target.includes('code')) {
          return NextResponse.json({ error: 'Product code already exists.' }, { status: 409 });
        }
      }
    }
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}