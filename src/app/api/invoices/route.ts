// src/app/api/invoices/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// Helper function to generate the next invoice number within a transaction
async function generateNextInvoiceNumber(tx: any): Promise<string> {
  const lastInvoice = await tx.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  if (!lastInvoice || !lastInvoice.invoiceNumber) {
    return 'INV1';
  }

  const match = lastInvoice.invoiceNumber.match(/^INV(\d+)$/);
  if (match) {
    const lastNumber = parseInt(match[1], 10);
    return `INV${lastNumber + 1}`;
  }
  return 'INV1'; // Fallback if format is unexpected
}

// Helper function to generate the next payment number within a transaction
async function generateNextPaymentNumber(tx: any): Promise<string> {
  const lastPayment = await tx.payment.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { paymentNumber: true },
  });

  if (!lastPayment || !lastPayment.paymentNumber) {
    return 'PAY1';
  }

  const match = lastPayment.paymentNumber.match(/^PAY(\d+)$/);
  if (match) {
    const lastNumber = parseInt(match[1], 10);
    return `PAY${lastNumber + 1}`;
  }
  return 'PAY1'; // Fallback
}

export async function POST(request: Request) {
  try {
    const {
      customerId,
      invoiceDate,
      items,
      totalAmount, // Subtotal
      discountAmount,
      paidAmount, // Amount paid at the time of invoice creation
      notes,
    } = await request.json();

    if (!customerId || !invoiceDate || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Start a Prisma transaction to ensure atomicity
    const newInvoice = await prisma.$transaction(async (tx) => {
      // 1. Get the current customer's balance BEFORE this invoice is applied
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, balance: true },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Calculate the net amount for this invoice (after discount)
      const currentInvoiceNetAmount = Math.max(0, totalAmount - (discountAmount || 0));

      // Calculate the balance due for THIS specific invoice
      const currentInvoiceBalanceDue = Math.max(0, currentInvoiceNetAmount - (paidAmount || 0));

      // Determine invoice status based on the current invoice's paid amount
      let status: InvoiceStatus;
      if (currentInvoiceBalanceDue <= 0) {
        status = InvoiceStatus.PAID;
      } else if ((paidAmount || 0) > 0) {
        status = InvoiceStatus.PARTIAL;
      } else {
        status = InvoiceStatus.PENDING;
      }

      // 2. Generate unique invoice number
      const nextInvoiceNumber = await generateNextInvoiceNumber(tx);

      // 3. Create the Invoice record
      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber: nextInvoiceNumber,
          customerId,
          invoiceDate: new Date(invoiceDate),
          totalAmount, // Subtotal
          discountAmount: discountAmount || 0,
          netAmount: currentInvoiceNetAmount,
          paidAmount: paidAmount || 0, // Store the amount paid for THIS invoice
          balanceDue: currentInvoiceBalanceDue, // Store balance due for THIS invoice
          status,
          notes,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
        },
        include: {
          customer: true, // Include customer for response (e.g., new balance for print)
          items: {
            include: {
              product: true, // Include product details for print template
            },
          },
        },
      });

      // 4. Update customer's overall balance
      // The customer's new overall balance is their old balance + the balance due from this new invoice
      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: customer.balance + currentInvoiceBalanceDue,
        },
      });

      // 5. Create a Payment record and PaymentAllocation if an amount was paid at creation
      if ((paidAmount || 0) > 0) {
        const nextPaymentNumber = await generateNextPaymentNumber(tx);
        const newPayment = await tx.payment.create({
          data: {
            paymentNumber: nextPaymentNumber,
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

      return createdInvoice; // Return the created invoice with its relations
    });

    return NextResponse.json(newInvoice);
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/invoices - Fetch all invoices (or filtered/paginated)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const orderBy = searchParams.get('orderBy') || 'createdAt';
    const direction = searchParams.get('direction') || 'desc';
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: any = {};
    if (customerId) {
      where.customerId = customerId;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        [orderBy]: direction,
      },
      take: limit,
      skip: offset,
    });

    const totalCount = await prisma.invoice.count({ where });

    return NextResponse.json({ invoices, totalCount });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices', details: (error as Error).message }, { status: 500 });
  }
}