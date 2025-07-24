// src/app/api/customers/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'; // Import specific Prisma error type

// GET /api/customers/[id]
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    return NextResponse.json(customer);
  } catch (error) {
    console.error(`Error fetching customer ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

// PUT /api/customers/[id]
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await request.json();
    // Destructure properties from body, allowing TypeScript to infer types
    const { name, code, contactPerson, phone, address } = body;

    // Basic validation
    if (!name || !code) {
      return NextResponse.json({ error: 'Name and Code are required' }, { status: 400 });
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        code,
        contactPerson,
        phone,
        address,
      },
    });
    return NextResponse.json(updatedCustomer);
  } catch (error) { // ⭐ Changed 'error: any' to 'error' and then check its type
    console.error(`Error updating customer ${params.id}:`, error);
    if (error instanceof PrismaClientKnownRequestError) { // ⭐ Use Prisma's specific error type
      if (error.code === 'P2002') { // Unique constraint violation
        if (error.meta?.target && Array.isArray(error.meta.target)) {
          if (error.meta.target.includes('phone')) {
            return NextResponse.json({ error: 'Phone number already exists.' }, { status: 409 });
          }
          if (error.meta.target.includes('code')) {
            return NextResponse.json({ error: 'Customer code already exists.' }, { status: 409 });
          }
        }
      }
    }
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

// DELETE /api/customers/[id]
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    // Before deleting, check if there are any related invoices or payments
    const relatedInvoices = await prisma.invoice.count({
      where: { customerId: id },
    });
    const relatedPayments = await prisma.payment.count({
      where: { customerId: id },
    });

    if (relatedInvoices > 0 || relatedPayments > 0) {
      return NextResponse.json(
        { error: 'Cannot delete customer with associated invoices or payments.' },
        { status: 409 } // Conflict
      );
    }

    await prisma.customer.delete({
      where: { id },
    });
    return NextResponse.json({ message: 'Customer deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting customer ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}