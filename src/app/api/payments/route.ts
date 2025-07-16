// src/app/api/payments/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';
import { generateNextPaymentNumber } from '@/lib/payment-utils'; // Import the utility

// GET /api/payments (No changes needed here for payment number generation)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderBy = searchParams.get('orderBy') || 'paymentDate';
    const direction = searchParams.get('direction') || 'desc';
    const limit = searchParams.get('limit');

    const findManyArgs: any = {
      include: {
        customer: {
          select: { name: true, phone: true },
        },
        paymentAllocations: {
          include: {
            invoice: {
              select: { invoiceNumber: true, id: true, totalAmount: true, paidAmount: true },
            },
          },
        },
      },
      orderBy: {
        [orderBy]: direction,
      },
    };

    if (limit) {
      findManyArgs.take = parseInt(limit, 10);
    }

    const payments = await prisma.payment.findMany(findManyArgs);

    const formattedPayments = payments.map(p => ({
      ...p,
      allocatedTo: p.paymentAllocations.map(pa => ({
        invoiceId: pa.invoice.id,
        invoiceNumber: pa.invoice.invoiceNumber,
        allocatedAmount: pa.allocatedAmount,
        invoiceTotal: pa.invoice.totalAmount,
        invoicePaidAmount: pa.invoice.paidAmount,
      }))
    }));

    return NextResponse.json(formattedPayments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

// POST /api/payments
export async function POST(request: Request) {
  try {
    const { customerId, amount, paymentDate, notes } = await request.json();

    if (!customerId || amount === undefined || amount <= 0) {
      return NextResponse.json({ error: 'Customer and a positive amount are required' }, { status: 400 });
    }

    // ⭐ Generate the next sequential payment number here
    const nextPaymentNumber = await generateNextPaymentNumber();

    // Use a Prisma transaction for atomicity
    const result = await prisma.$transaction(async (prisma) => {
      // 1. Create the new Payment record
      const payment = await prisma.payment.create({
        data: {
          paymentNumber: nextPaymentNumber, // ⭐ Assign the generated number
          customerId,
          amount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          notes,
        },
      });

      let remainingPaymentAmount = amount;
      const allocationsToCreate = [];

      // 2. Fetch all PENDING or PARTIAL invoices for the customer, ordered by oldest first
      const outstandingInvoices = await prisma.invoice.findMany({
        where: {
          customerId,
          status: {
            in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL],
          },
        },
        orderBy: {
          invoiceDate: 'asc', // FIFO: Oldest invoices first
        },
      });

      // 3. Allocate payment to invoices (FIFO)
      for (const invoice of outstandingInvoices) {
        if (remainingPaymentAmount <= 0) break;

        const amountDueOnInvoice = invoice.totalAmount - invoice.paidAmount;

        if (amountDueOnInvoice <= 0) continue;

        const amountToApplyToThisInvoice = Math.min(remainingPaymentAmount, amountDueOnInvoice);

        allocationsToCreate.push({
          paymentId: payment.id,
          invoiceId: invoice.id,
          allocatedAmount: amountToApplyToThisInvoice,
        });

        const newPaidAmountForInvoice = invoice.paidAmount + amountToApplyToThisInvoice;
        let newStatus: InvoiceStatus;

        if (newPaidAmountForInvoice >= invoice.totalAmount) {
          newStatus = InvoiceStatus.PAID;
        } else {
          newStatus = InvoiceStatus.PARTIAL;
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmountForInvoice,
            status: newStatus,
          },
        });

        remainingPaymentAmount -= amountToApplyToThisInvoice;
      }

      // 4. Create all payment allocations in a batch
      if (allocationsToCreate.length > 0) {
        await prisma.paymentAllocation.createMany({
          data: allocationsToCreate,
        });
      }

      // 5. Update the customer's overall balance
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      return payment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating payment or allocating:', error);
    return NextResponse.json({ error: 'Failed to process payment', details: (error as Error).message }, { status: 500 });
  }
}