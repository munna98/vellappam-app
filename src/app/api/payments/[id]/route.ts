// src/app/api/payments/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// GET /api/payments/[id] - Fetch a single payment with its customer and allocations
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        customer: true,
        paymentAllocations: {
          include: {
            invoice: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }
    return NextResponse.json(payment);
  } catch (error) {
    console.error(`Error fetching payment ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 });
  }
}

// PUT /api/payments/[id] - Update a payment
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    // Removed paymentMethod from destructure and validation
    const { customerId, amount, paymentDate, notes } = await request.json();

    if (!customerId || amount === undefined || amount <= 0) { // Removed paymentMethod check
      return NextResponse.json({ error: 'Customer and a positive amount are required' }, { status: 400 });
    }

    const updatedPayment = await prisma.$transaction(async (prisma) => {
      // 1. Get the original payment details and its allocations
      const originalPayment = await prisma.payment.findUnique({
        where: { id },
        include: { paymentAllocations: true },
      });

      if (!originalPayment) {
        throw new Error('Original payment not found for update.');
      }

      const oldAmount = originalPayment.amount;
      const oldCustomerId = originalPayment.customerId;
      const oldAllocations = originalPayment.paymentAllocations;

      // 2. Reverse the effects of the old payment and its allocations
      await prisma.customer.update({
        where: { id: oldCustomerId },
        data: {
          balance: {
            increment: oldAmount,
          },
        },
      });

      for (const oldAlloc of oldAllocations) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: oldAlloc.invoiceId },
        });

        if (invoice) {
          const newPaidAmount = invoice.paidAmount - oldAlloc.allocatedAmount;
          let newStatus: InvoiceStatus;

          if (newPaidAmount >= invoice.totalAmount) {
            newStatus = InvoiceStatus.PAID;
          } else if (newPaidAmount > 0) {
            newStatus = InvoiceStatus.PARTIAL;
          } else {
            newStatus = InvoiceStatus.PENDING;
          }

          await prisma.invoice.update({
            where: { id: oldAlloc.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
            },
          });
        }
      }
      await prisma.paymentAllocation.deleteMany({
        where: { paymentId: id },
      });

      // 3. Update the Payment record itself
      const payment = await prisma.payment.update({
        where: { id },
        data: {
          customerId,
          amount,
          paymentDate: paymentDate ? new Date(paymentDate) : originalPayment.paymentDate,
          notes: notes !== undefined ? notes : originalPayment.notes,
          // paymentNumber is NOT editable and will be kept as original
        },
      });

      let remainingPaymentAmount = amount;
      const allocationsToCreate = [];

      // 4. Re-allocate the new payment amount to the customer's outstanding invoices (FIFO)
      const outstandingInvoices = await prisma.invoice.findMany({
        where: {
          customerId,
          status: {
            in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL],
          },
        },
        orderBy: {
          invoiceDate: 'asc',
        },
      });

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

      // 5. Create new payment allocations
      if (allocationsToCreate.length > 0) {
        await prisma.paymentAllocation.createMany({
          data: allocationsToCreate,
        });
      }

      // 6. Update customer's balance with the new total payment amount
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

    return NextResponse.json(updatedPayment);
  } catch (error: any) {
    console.error(`Error updating payment ${params.id}:`, error);
    return NextResponse.json({ error: error.message || 'Failed to update payment' }, { status: 500 });
  }
}

// DELETE /api/payments/[id] - Delete a payment (No changes needed for logic)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    await prisma.$transaction(async (prisma) => {
      // 1. Get the payment details and its allocations
      const paymentToDelete = await prisma.payment.findUnique({
        where: { id },
        include: { paymentAllocations: true },
      });

      if (!paymentToDelete) {
        throw new Error('Payment not found for deletion.');
      }

      const paymentAmount = paymentToDelete.amount;
      const customerId = paymentToDelete.customerId;
      const allocations = paymentToDelete.paymentAllocations;

      // 2. Reverse the effect on the customer's balance
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            increment: paymentAmount,
          },
        },
      });

      // 3. Reverse the effect on associated invoices' paidAmount and status
      for (const alloc of allocations) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: alloc.invoiceId },
        });

        if (invoice) {
          const newPaidAmount = invoice.paidAmount - alloc.allocatedAmount;
          let newStatus: InvoiceStatus;

          if (newPaidAmount >= invoice.totalAmount) {
            newStatus = InvoiceStatus.PAID;
          } else if (newPaidAmount > 0) {
            newStatus = InvoiceStatus.PARTIAL;
          } else {
            newStatus = InvoiceStatus.PENDING;
          }

          await prisma.invoice.update({
            where: { id: alloc.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
            },
          });
        }
      }

      // 4. Delete associated PaymentAllocations
      await prisma.paymentAllocation.deleteMany({
        where: { paymentId: id },
      });

      // 5. Delete the Payment itself
      await prisma.payment.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Payment deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error(`Error deleting payment ${params.id}:`, error);
    return NextResponse.json({ error: error.message || 'Failed to delete payment' }, { status: 500 });
  }
}