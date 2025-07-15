// src/app/api/invoices/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// GET /api/invoices
// Can accept query params for ordering and limiting, e.g., ?orderBy=createdAt&direction=desc&limit=1
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const orderBy = searchParams.get('orderBy') || 'invoiceDate'; // Default order
    const direction = searchParams.get('direction') || 'desc'; // Default direction
    const limit = searchParams.get('limit');

    const whereClause: { status?: InvoiceStatus } = {};
    if (status && Object.values(InvoiceStatus).includes(status as InvoiceStatus)) {
      whereClause.status = status as InvoiceStatus;
    }

    const findManyArgs: any = {
      where: whereClause,
      include: {
        customer: {
          select: { name: true, phone: true },
        },
      },
      orderBy: {
        [orderBy]: direction,
      },
    };

    if (limit) {
      findManyArgs.take = parseInt(limit, 10);
    }

    const invoices = await prisma.invoice.findMany(findManyArgs);
    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST /api/invoices (Existing code - no change needed here for auto-generation)
// ... (your existing POST code for creating invoices)
export async function POST(request: Request) {
  try {
    const { customerId, items, notes, totalAmount, invoiceNumber } = await request.json(); // Added invoiceNumber

    // Basic validation
    if (!customerId || !Array.isArray(items) || items.length === 0 || totalAmount === undefined || !invoiceNumber) {
      return NextResponse.json({ error: 'Missing required fields: customerId, items, totalAmount, invoiceNumber' }, { status: 400 });
    }

    // Use a Prisma transaction to ensure all operations succeed or fail together
    const newInvoice = await prisma.$transaction(async (prisma) => {
      // 1. Create the new Invoice
      const invoice = await prisma.invoice.create({
        data: {
          customerId,
          totalAmount,
          notes,
          status: InvoiceStatus.PENDING,
          invoiceNumber, // Use the provided invoiceNumber
        },
      });

      // 2. Create the InvoiceItems (line items) and link them to the invoice
      const invoiceItems = items.map((item: any) => ({
        invoiceId: invoice.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      }));

      await prisma.invoiceItem.createMany({
        data: invoiceItems,
      });

      // 3. Update the customer's balance by adding the new total amount
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            increment: totalAmount,
          },
        },
      });

      return invoice;
    });

    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('invoiceNumber')) {
      return NextResponse.json({ error: 'Invoice number already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}