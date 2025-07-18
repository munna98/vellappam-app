// src/app/api/payments/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// Helper function to generate the next payment number (not directly used in PUT but good to keep if needed)
async function generateNextPaymentNumber() {
  const lastPayment = await prisma.payment.findFirst({
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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
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
                select: { id: true, paidAmount: true, balanceDue: true, netAmount: true, status: true } // Include netAmount
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
        const invoice = oldAlloc.invoice; // Use the included invoice directly
        if (invoice) {
          const newPaidAmount = invoice.paidAmount - oldAlloc.allocatedAmount;
          const newBalanceDue = invoice.balanceDue + oldAlloc.allocatedAmount; // Add back to balanceDue

          let newStatus: InvoiceStatus;
          if (newBalanceDue <= 0) {
            newStatus = InvoiceStatus.PAID;
          } else if (newPaidAmount > 0) { // If there's still some payment
            newStatus = InvoiceStatus.PARTIAL;
          } else { // No payment left
            newStatus = InvoiceStatus.PENDING;
          }

          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount: newPaidAmount,
              balanceDue: newBalanceDue, // Update balanceDue
              status: newStatus,
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
          status: {
            in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL],
          },
          balanceDue: { gt: 0 }, // Only invoices with outstanding balance
        },
        orderBy: {
          invoiceDate: 'asc',
        },
        select: {
          id: true,
          netAmount: true, // Crucial: Use netAmount for calculation
          paidAmount: true,
          balanceDue: true, // Crucial: Use current balanceDue
        },
      });

      for (const invoice of outstandingInvoices) {
        if (remainingPaymentAmount <= 0) break;

        // Use invoice.balanceDue directly for amount remaining on invoice
        const amountDueOnInvoice = invoice.balanceDue;

        if (amountDueOnInvoice <= 0) continue; // Skip if already fully paid or negative balance

        const amountToApplyToThisInvoice = Math.min(remainingPaymentAmount, amountDueOnInvoice);

        allocationsToCreate.push({
          paymentId: payment.id,
          invoiceId: invoice.id,
          allocatedAmount: amountToApplyToThisInvoice,
        });

        const newPaidAmountForInvoice = invoice.paidAmount + amountToApplyToThisInvoice;
        const newBalanceDueForInvoice = invoice.balanceDue - amountToApplyToThisInvoice; // Subtract from balanceDue

        let newStatus: InvoiceStatus;
        if (newBalanceDueForInvoice <= 0) { // Check against the new balanceDue
          newStatus = InvoiceStatus.PAID;
        } else if (newPaidAmountForInvoice > 0) {
          newStatus = InvoiceStatus.PARTIAL;
        } else {
          newStatus = InvoiceStatus.PENDING;
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmountForInvoice,
            balanceDue: newBalanceDueForInvoice, // Update balanceDue
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
      // The old amount was already added back in step 2.
      // Now subtract the new amount.
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
        include: {
          paymentAllocations: {
            include: {
              invoice: {
                select: { id: true, paidAmount: true, balanceDue: true, status: true } // Include balanceDue
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
        const invoice = alloc.invoice; // Use the included invoice directly
        if (invoice) {
          const newPaidAmount = invoice.paidAmount - alloc.allocatedAmount;
          const newBalanceDue = invoice.balanceDue + alloc.allocatedAmount; // Add back to balanceDue

          let newStatus: InvoiceStatus;
          if (newBalanceDue <= 0) { // Check against newBalanceDue
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
              balanceDue: newBalanceDue, // Update balanceDue
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