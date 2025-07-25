// src/app/api/invoices/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client'; // Import Prisma for types

// Function to generate the next invoice number safely within a transaction
async function generateNextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Optimized: Query only the latest invoice for the highest number
  const lastInvoice = await tx.invoice.findFirst({
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: 'desc' }, // Sort by invoiceNumber descending to get the latest INVXYZ
  });

  let maxNumericInvoice = 0;
  if (lastInvoice && lastInvoice.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/^INV(\d+)$/);
    if (match) {
      maxNumericInvoice = parseInt(match[1], 10);
    }
  }
  return `INV${maxNumericInvoice + 1}`;
}

// Function to generate the next payment number safely within a transaction
async function generateNextPaymentNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Optimized: Query only the latest payment for the highest number
  const lastPayment = await tx.payment.findFirst({
    select: { paymentNumber: true },
    orderBy: { paymentNumber: 'desc' }, // Sort by paymentNumber descending to get the latest PAYXYZ
  });

  if (!lastPayment || !lastPayment.paymentNumber) {
    return 'PAY1';
  }

  const match = lastPayment.paymentNumber.match(/^PAY(\d+)$/);
  if (match) {
    const lastNumber = parseInt(match[1], 10);
    return `PAY${lastNumber + 1}`;
  }
  return 'PAY1'; // Fallback if format is unexpected (should ideally not happen)
}

export async function POST(request: Request) {
  try {
    const {
      customerId,
      invoiceDate,
      items,
      totalAmount,
      discountAmount,
      paidAmount,
      notes,
    } = await request.json();

    // Basic validation
    if (!customerId || !invoiceDate || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields or no items provided' }, { status: 400 });
    }

    const newInvoice = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, balance: true },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      const currentInvoiceNetAmount = Math.max(0, totalAmount - (discountAmount || 0));
      const currentInvoiceBalanceDue = Math.max(0, currentInvoiceNetAmount - (paidAmount || 0));

      let status: InvoiceStatus;
      if (currentInvoiceBalanceDue <= 0.001) { // Using a small epsilon for floating point comparison
        status = InvoiceStatus.PAID;
      } else {
        status = InvoiceStatus.PENDING;
      }

      // Generate invoice number within the transaction
      const nextInvoiceNumber = await generateNextInvoiceNumber(tx);

      let nextPaymentNumber: string | null = null;
      if ((paidAmount || 0) > 0) {
        // Generate payment number within the transaction for atomicity
        nextPaymentNumber = await generateNextPaymentNumber(tx);
      }

      // 1. Create the Invoice
      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber: nextInvoiceNumber,
          customerId,
          invoiceDate: new Date(invoiceDate),
          totalAmount,
          discountAmount: discountAmount || 0,
          netAmount: currentInvoiceNetAmount,
          paidAmount: paidAmount || 0,
          balanceDue: currentInvoiceBalanceDue,
          status,
          notes,
        },
      });

      // 2. Create Invoice Items
      const invoiceItemsToCreate = items.map((item: { productId: string; quantity: number; unitPrice: number; total: number }) => ({
        invoiceId: createdInvoice.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      }));

      await tx.invoiceItem.createMany({
        data: invoiceItemsToCreate,
      });

      // 3. Update Customer Balance
      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: customer.balance + currentInvoiceBalanceDue,
        },
      });

      // 4. Handle Payment
      if ((paidAmount || 0) > 0 && nextPaymentNumber) { // Ensure nextPaymentNumber is available
        const newPayment = await tx.payment.create({
          data: {
            paymentNumber: nextPaymentNumber, // Use the generated number
            customerId: customerId,
            amount: paidAmount,
            paymentDate: new Date(),
            notes: `Payment for Invoice ${createdInvoice.invoiceNumber} at creation.`,
          },
        });

        await tx.paymentAllocation.create({
          data: {
            paymentId: newPayment.id,
            invoiceId: createdInvoice.id,
            allocatedAmount: paidAmount,
          },
        });
      }

      return createdInvoice;
    }, {
      maxWait: 10000, // 10 seconds to start (default is 2 seconds)
      timeout: 10000, // 10 seconds for the transaction to complete (default is 5 seconds)
    });

    // Fetch complete invoice with relations after transaction
    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: newInvoice.id },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return NextResponse.json(fullInvoice);
  } catch (error: unknown) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice', details: (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') as InvoiceStatus | undefined; // Cast to InvoiceStatus
    const customerId = searchParams.get('customerId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        {
          customer: {
            name: { contains: search, mode: 'insensitive' }
          }
        },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    // The getLatestNumber logic in GET is generally not recommended for
    // generating *new* numbers in a production system due to race conditions.
    // It's much safer to do it within a transaction on the POST route.
    // However, if you're using this solely for display purposes (e.g., suggesting the next number
    // in the UI before form submission), it can remain, but be aware of its limitations.
    const getLatestNumber = searchParams.get('getLatestNumber');
    if (getLatestNumber === 'true') {
      const lastInvoice = await prisma.invoice.findFirst({
        select: { invoiceNumber: true },
        orderBy: { invoiceNumber: 'desc' },
      });

      let maxNumericInvoice = 0;
      if (lastInvoice && lastInvoice.invoiceNumber) {
        const match = lastInvoice.invoiceNumber.match(/^INV(\d+)$/);
        if (match) {
          maxNumericInvoice = parseInt(match[1], 10);
        }
      }
      return NextResponse.json({ latestNumericInvoice: maxNumericInvoice });
    }

    const [invoices, totalCount] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: {
            select: { name: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      data: invoices,
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices', details: (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}