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
            invoice: true, // Include invoice details for each allocation
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
// This is complex! It requires reversing old allocations/customer balance and applying new ones.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { customerId, amount, paymentMethod, paymentNumber, allocations } = await request.json();

    if (!customerId || !amount || !paymentMethod || !paymentNumber || !Array.isArray(allocations)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const totalAllocated = allocations.reduce((sum: number, alloc: any) => sum + alloc.allocatedAmount, 0);
    if (totalAllocated > amount) {
      return NextResponse.json({ error: 'Total allocated amount exceeds payment amount.' }, { status: 400 });
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
      // Re-increment customer balance by the old payment amount
      await prisma.customer.update({
        where: { id: oldCustomerId },
        data: {
          balance: {
            increment: oldAmount,
          },
        },
      });

      // Revert invoice paid amounts and statuses for old allocations
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
      // Delete old allocations
      await prisma.paymentAllocation.deleteMany({
        where: { paymentId: id },
      });

      // 3. Update the Payment record itself
      const payment = await prisma.payment.update({
        where: { id },
        data: {
          customerId,
          amount,
          paymentMethod,
          paymentNumber,
          notes: originalPayment.notes, // Keep old notes or update from request
          // paymentDate defaults to now if not provided, or can be passed in
        },
      });

      // 4. Apply the effects of the new payment and its allocations
      // Decrement customer balance by the new payment amount
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      // Create new allocations and update invoices
      for (const newAlloc of allocations) {
        if (newAlloc.allocatedAmount > 0) {
          await prisma.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: newAlloc.invoiceId,
              allocatedAmount: newAlloc.allocatedAmount,
            },
          });

          const invoice = await prisma.invoice.findUnique({
            where: { id: newAlloc.invoiceId },
          });

          if (invoice) {
            const newPaidAmount = invoice.paidAmount + newAlloc.allocatedAmount;
            let newStatus: InvoiceStatus;

            if (newPaidAmount >= invoice.totalAmount) {
              newStatus = InvoiceStatus.PAID;
            } else if (newPaidAmount > 0) {
              newStatus = InvoiceStatus.PARTIAL;
            } else {
              newStatus = InvoiceStatus.PENDING;
            }

            await prisma.invoice.update({
              where: { id: newAlloc.invoiceId },
              data: {
                paidAmount: newPaidAmount,
                status: newStatus,
              },
            });
          }
        }
      }

      return payment;
    });

    return NextResponse.json(updatedPayment);
  } catch (error: any) {
    console.error(`Error updating payment ${params.id}:`, error);
    if (error.code === 'P2002' && error.meta?.target?.includes('paymentNumber')) {
      return NextResponse.json({ error: 'Payment number already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update payment' }, { status: 500 });
  }
}

// DELETE /api/payments/[id] - Delete a payment
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
      // Re-increment customer balance by the deleted payment amount
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

          if (newPaidAmount >= invoice.totalAmount) { // Should technically not happen if decrementing
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