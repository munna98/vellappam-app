// src/app/api/customers/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/customers
export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: {
        name: 'asc', // Order by customer name
      },
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

// POST /api/customers
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, code, contactPerson, phone, address } = body;

    // You can add validation here if needed
    if (!name || !code) {
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
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
