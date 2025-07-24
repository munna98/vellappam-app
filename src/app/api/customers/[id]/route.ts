// src/app/api/customers/[id]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Helper to extract ID from the URL
function extractId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1] || null;
}

// GET /api/customers/[id]
export async function GET(request: NextRequest) {
  const id = extractId(request);
  if (!id) return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });

  try {
    const customer = await prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error(`Error fetching customer ${id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

// PUT /api/customers/[id]
export async function PUT(request: NextRequest) {
  const id = extractId(request);
  if (!id) return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });

  try {
    const body = await request.json();
    const { name, code, contactPerson, phone, address } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and Code are required' }, { status: 400 });
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: { name, code, contactPerson, phone, address },
    });

    return NextResponse.json(updatedCustomer);
  } catch (error) {
    console.error(`Error updating customer ${id}:`, error);
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        if (Array.isArray(target)) {
          if (target.includes('phone')) {
            return NextResponse.json({ error: 'Phone number already exists.' }, { status: 409 });
          }
          if (target.includes('code')) {
            return NextResponse.json({ error: 'Customer code already exists.' }, { status: 409 });
          }
        }
      }
    }
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

// DELETE /api/customers/[id]
export async function DELETE(request: NextRequest) {
  const id = extractId(request);
  if (!id) return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });

  try {
    const relatedInvoices = await prisma.invoice.count({ where: { customerId: id } });
    const relatedPayments = await prisma.payment.count({ where: { customerId: id } });

    if (relatedInvoices > 0 || relatedPayments > 0) {
      return NextResponse.json(
        { error: 'Cannot delete customer with associated invoices or payments.' },
        { status: 409 }
      );
    }

    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ message: 'Customer deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting customer ${id}:`, error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
