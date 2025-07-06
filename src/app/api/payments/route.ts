// src/app/api/payments/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// GET /api/payments (No changes needed for GET, it will fetch payments but not their allocations yet)
export async function GET() {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        customer: {
          select: { name: true, phone: true },
        },
        // We cannot directly include 'invoice' anymore as it's not a direct relation.
        // If we want to show which invoices were affected, we'd need to include paymentAllocations.
        paymentAllocations: {
          include: {
            invoice: {
              select: { invoiceNumber: true, id: true },
            },
          },
        },
      },
      orderBy: {
        paymentDate: 'desc',
      },
    });

    // Transform payments to flatten allocations for display
    const formattedPayments = payments.map(p => ({
      ...p,
      allocatedTo: p.paymentAllocations.map(pa => ({
        invoiceId: pa.invoice.id,
        invoiceNumber: pa.invoice.invoiceNumber,
        allocatedAmount: pa.allocatedAmount,
      }))
    }));

    return NextResponse.json(formattedPayments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

// POST /api/payments - **CRUCIAL CHANGES HERE**
export async function POST(request: Request) {
  try {
    const { customerId, amount, paymentDate, notes } = await request.json();

    if (!customerId || amount === undefined || amount <= 0) {
      return NextResponse.json({ error: 'Customer and a positive amount are required' }, { status: 400 });
    }

    // Use a Prisma transaction for atomicity
    const result = await prisma.$transaction(async (prisma) => {
      // 1. Create the new Payment record
      const payment = await prisma.payment.create({
        data: {
          customerId,
          amount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          notes,
          // paymentNumber is auto-generated
        },
      });

      let remainingPaymentAmount = amount;
      const allocationsToCreate = []; // Array to store PaymentAllocation records

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
        if (remainingPaymentAmount <= 0) break; // No more payment left to allocate

        const amountDueOnInvoice = invoice.totalAmount - invoice.paidAmount;

        if (amountDueOnInvoice <= 0) continue; // This invoice is already fully paid, skip

        const amountToApplyToThisInvoice = Math.min(remainingPaymentAmount, amountDueOnInvoice);

        // Record the allocation
        allocationsToCreate.push({
          paymentId: payment.id,
          invoiceId: invoice.id,
          allocatedAmount: amountToApplyToThisInvoice,
        });

        // Update the invoice's paid amount and status
        const newPaidAmountForInvoice = invoice.paidAmount + amountToApplyToThisInvoice;
        let newStatus: InvoiceStatus;

        if (newPaidAmountForInvoice >= invoice.totalAmount) {
          newStatus = InvoiceStatus.PAID; // Fully paid
        } else {
          newStatus = InvoiceStatus.PARTIAL; // Partially paid
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmountForInvoice,
            status: newStatus,
          },
        });

        remainingPaymentAmount -= amountToApplyToThisInvoice; // Deduct applied amount from payment
      }

      // 4. Create all payment allocations in a batch
      if (allocationsToCreate.length > 0) {
        await prisma.paymentAllocation.createMany({
          data: allocationsToCreate,
        });
      }

      // 5. Update the customer's overall balance (decrement by the total payment amount)
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: amount, // Decrease customer balance by the total payment amount
          },
        },
      });

      return payment; // Return the created payment object
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating payment or allocating:', error);
    // You might want to return a more specific error message based on the error type
    return NextResponse.json({ error: 'Failed to process payment', details: (error as Error).message }, { status: 500 });
  }
}