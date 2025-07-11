// src/app/api/customers/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/customers
// Can accept query params for ordering and limiting, e.g., ?orderBy=createdAt&direction=desc&limit=1
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

    const customers = await prisma.customer.findMany(findManyArgs);
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

// POST /api/customers (No changes here for now, logic will be in frontend)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, code, contactPerson, phone, address } = body;

    // You can add validation here if needed
    if (!name || !code) { // Code is now required
      return NextResponse.json({ error: 'Name and Code are required' }, { status: 400 });
    }

    const newCustomer = await prisma.customer.create({
      data: {
        name,
        code,
        contactPerson,
        phone,
        address,
      },
    });
    return NextResponse.json(newCustomer, { status: 201 });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
      return NextResponse.json({ error: 'Phone number already exists.' }, { status: 409 });
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('code')) {
      return NextResponse.json({ error: 'Customer code already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}