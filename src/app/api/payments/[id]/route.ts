// src/app/api/payments/[id]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// Helper to extract ID from the URL (re-use the same logic)
function extractId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1] || null;
}

export async function GET(request: NextRequest) {
  const id = extractId(request);
  if (!id) return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 });

  try {
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
  } catch (error: unknown) {
    console.error(`Error fetching payment ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch payment';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const id = extractId(request);
  if (!id) return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 });

  try {
    const { customerId, amount, paymentDate, notes } = await request.json();

    // Basic validation
    if (!customerId || amount === undefined || amount <= 0) {
      return NextResponse.json({ error: 'Customer and a positive amount are required' }, { status: 400 });
    }

    const updatedPayment = await prisma.$transaction(async (prisma) => {
      // 1. Get the original payment details and its allocations
      const originalPayment = await prisma.payment.findUnique({
        where: { id },
        include: {
          paymentAllocations: {
            include: {
              invoice: {
                select: { id: true, paidAmount: true, balanceDue: true, netAmount: true, status: true }
              }
            }
          }
        },
      });

      if (!originalPayment) {
        throw new Error('Original payment not found for update.');
      }

      const oldAmount = originalPayment.amount;
      const oldCustomerId = originalPayment.customerId;
      const oldAllocations = originalPayment.paymentAllocations;

      // 2. Reverse the effects of the old payment and its allocations
      // Revert customer balance: Add back the original amount that was subtracted
      await prisma.customer.update({
        where: { id: oldCustomerId },
        data: {
          balance: {
            increment: oldAmount,
          },
        },
      });

      // Revert affected invoices' paidAmount, balanceDue, and status
      for (const oldAlloc of oldAllocations) {
        const invoice = oldAlloc.invoice;
        if (invoice) {
          const newPaidAmount = invoice.paidAmount - oldAlloc.allocatedAmount;
          const newBalanceDue = invoice.balanceDue + oldAlloc.allocatedAmount;

          let newStatus: InvoiceStatus;
          if (newBalanceDue <= 0.001) { // Balance is zero or negligible
            newStatus = InvoiceStatus.PAID;
          } else {
            newStatus = InvoiceStatus.PENDING; // Otherwise, it's PENDING
          }

          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount: newPaidAmount,
              balanceDue: newBalanceDue,
              status: newStatus, // Use the new status
            },
          });
        }
      }
      // Delete all old allocations for this payment
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
        },
      });

      let remainingPaymentAmount = amount;
      const allocationsToCreate = [];

      // 4. Re-allocate the new payment amount to the customer's outstanding invoices (FIFO)
      const outstandingInvoices = await prisma.invoice.findMany({
        where: {
          customerId,
          status: InvoiceStatus.PENDING, // Now only PENDING are outstanding
          balanceDue: { gt: 0 },
        },
        orderBy: {
          invoiceDate: 'asc',
        },
        select: {
          id: true,
          netAmount: true,
          paidAmount: true,
          balanceDue: true,
        },
      });

      for (const invoice of outstandingInvoices) {
        if (remainingPaymentAmount <= 0) break;

        const amountDueOnInvoice = invoice.balanceDue;

        if (amountDueOnInvoice <= 0) continue;

        const amountToApplyToThisInvoice = Math.min(remainingPaymentAmount, amountDueOnInvoice);

        allocationsToCreate.push({
          paymentId: payment.id,
          invoiceId: invoice.id,
          allocatedAmount: amountToApplyToThisInvoice,
        });

        const newPaidAmountForInvoice = invoice.paidAmount + amountToApplyToThisInvoice;
        const newBalanceDueForInvoice = invoice.balanceDue - amountToApplyToThisInvoice;

        let newStatus: InvoiceStatus;
        if (newBalanceDueForInvoice <= 0.001) { // Balance is zero or negligible
          newStatus = InvoiceStatus.PAID;
        } else {
          newStatus = InvoiceStatus.PENDING; // Otherwise, it's PENDING
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmountForInvoice,
            balanceDue: newBalanceDueForInvoice,
            status: newStatus, // Use the new status
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
  } catch (error: unknown) {
    console.error(`Error updating payment ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update payment';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/payments/[id] - Delete a payment
export async function DELETE(request: NextRequest) {
  const id = extractId(request);
  if (!id) return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 });

  try {
    await prisma.$transaction(async (prisma) => {
      // 1. Get the payment details and its allocations
      const paymentToDelete = await prisma.payment.findUnique({
        where: { id },
        include: {
          paymentAllocations: {
            include: {
              invoice: {
                select: { id: true, paidAmount: true, balanceDue: true, status: true }
              }
            }
          }
        },
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
        const invoice = alloc.invoice;
        if (invoice) {
          const newPaidAmount = invoice.paidAmount - alloc.allocatedAmount;
          const newBalanceDue = invoice.balanceDue + alloc.allocatedAmount;

          let newStatus: InvoiceStatus;
          if (newBalanceDue <= 0.001) { // Balance is zero or negligible
            newStatus = InvoiceStatus.PAID;
          } else {
            newStatus = InvoiceStatus.PENDING; // Otherwise, it's PENDING
          }

          await prisma.invoice.update({
            where: { id: alloc.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              balanceDue: newBalanceDue,
              status: newStatus, // Use the new status
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
  } catch (error: unknown) {
    console.error(`Error deleting payment ${id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete payment';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}