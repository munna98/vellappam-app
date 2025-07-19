// src/app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id;
    const {
      customerId, // Customer ID (should typically not change for an existing invoice)
      invoiceDate,
      items, // Updated list of invoice items
      totalAmount, // New subtotal
      discountAmount,
      paidAmount, // New total paid amount for this invoice
      notes,
    } = await request.json();

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }
    if (!customerId || !invoiceDate || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Start a Prisma transaction for atomicity
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // 1. Fetch the existing invoice and its customer with necessary details
      const existingInvoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true, // To get current customer balance
          items: true, // To compare and update items
          paymentAllocations: true, // To handle existing allocations
        },
      });

      if (!existingInvoice) {
        throw new Error('Invoice not found');
      }

      // Store old values for comparison
      const oldInvoiceBalanceDue = existingInvoice.balanceDue;
      const oldInvoicePaidAmount = existingInvoice.paidAmount;

      // Calculate new net amount and balance due for THIS invoice
      const newInvoiceNetAmount = Math.max(0, totalAmount - (discountAmount || 0));
      const newInvoiceBalanceDue = Math.max(0, newInvoiceNetAmount - (paidAmount || 0));

      // Determine new invoice status
      let newStatus: InvoiceStatus;
      if (newInvoiceBalanceDue <= 0) {
        newStatus = InvoiceStatus.PAID;
      } else if ((paidAmount || 0) > 0) {
        newStatus = InvoiceStatus.PARTIAL;
      } else {
        newStatus = InvoiceStatus.PENDING;
      }

      // 2. Adjust customer's overall balance
      // Calculate the change in this invoice's balance due
      const balanceDueChange = newInvoiceBalanceDue - oldInvoiceBalanceDue;

      // Update customer's balance by applying the change
      await tx.customer.update({
        where: { id: existingInvoice.customerId },
        data: {
          balance: existingInvoice.customer.balance + balanceDueChange,
        },
      });

      // 3. Sync invoice items (delete old, create new, update existing)
      const existingItemIds = new Set(existingInvoice.items.map(item => item.id));
      const incomingItemIds = new Set(items.map((item: any) => item.id).filter(Boolean)); // Filter out null/undefined for new items

      // Items to delete (present in existing but not in incoming items)
      const itemsToDelete = existingInvoice.items.filter(item => !incomingItemIds.has(item.id));

      // Execute deletes first
      if (itemsToDelete.length > 0) {
        await tx.invoiceItem.deleteMany({
          where: { id: { in: itemsToDelete.map(item => item.id) } },
        });
      }

      // Items to create or update
      for (const item of items) {
        const data = {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        };
        if (item.id && existingItemIds.has(item.id)) {
          // Update existing item
          await tx.invoiceItem.update({
            where: { id: item.id },
            data: data,
          });
        } else {
          // Create new item
          await tx.invoiceItem.create({
            data: { ...data, invoiceId: invoiceId },
          });
        }
      }

      // 4. Handle Payment creation/allocation if paidAmount has increased
      const paymentDifference = (paidAmount || 0) - oldInvoicePaidAmount;

      if (paymentDifference > 0) { // Only create new payment if amount has increased
        const nextPaymentNumber = await generateNextPaymentNumber(tx);
        const newPayment = await tx.payment.create({
          data: {
            paymentNumber: nextPaymentNumber,
            customerId: existingInvoice.customerId,
            amount: paymentDifference,
            paymentDate: new Date(),
            notes: `Additional payment for Invoice ${existingInvoice.invoiceNumber} during edit.`,
          },
        });

        await tx.paymentAllocation.create({
          data: {
            paymentId: newPayment.id,
            invoiceId: existingInvoice.id,
            allocatedAmount: paymentDifference,
          },
        });
      }
      // Note: Decreasing paidAmount (refunds/corrections) is a more complex scenario
      // that typically involves creating negative payment records or explicit refund processes.
      // This current implementation only handles increases in paidAmount.


      // 5. Update the Invoice record itself
      const updatedInvoiceRecord = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId, // Update customerId if it was changed (uncommon for existing invoices)
          invoiceDate: new Date(invoiceDate),
          totalAmount,
          discountAmount: discountAmount || 0,
          netAmount: newInvoiceNetAmount,
          paidAmount: paidAmount || 0, // Update paid amount on invoice
          balanceDue: newInvoiceBalanceDue, // Update balance due on invoice
          status: newStatus,
          notes,
        },
        include: {
          customer: true, // Include customer for response
          items: {
            include: {
              product: true, // Include product details for print template
            },
          },
        },
      });

      return updatedInvoiceRecord; // Return the updated invoice with its relations
    });

    return NextResponse.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/invoices/[id] - Delete a payment (No changes needed for logic)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const invoiceId = params.id;
  try {
    // 1. Fetch invoice details needed for customer balance adjustment
    const invoiceToDelete = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        customerId: true,
        netAmount: true, // The original total value of the invoice
        balanceDue: true, // Need this to reverse its impact on customer balance
      },
    });

    if (!invoiceToDelete) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await prisma.$transaction(async (prisma) => {
      // 1.1. Delete associated PaymentAllocations first
      // This is crucial. When these allocations are deleted, the amounts they represented
      // are effectively "freed up" on their original Payment records.
      // These freed amounts will then contribute to the Payment's unallocated balance,
      // which in turn will correctly impact the customer's overall balance
      // (making it more negative, or reducing outstanding debt on other invoices).
      await prisma.paymentAllocation.deleteMany({
        where: { invoiceId: invoiceId },
      });

      // 1.2. Adjust customer balance
      // When an invoice is deleted, its balanceDue is removed from the customer's total outstanding balance.
      // So, the customer's balance should be DECREMENTED by this invoice's balanceDue.
      // Any payments made (which are still in the system) will then implicitly cause a credit
      // for the customer if they no longer cover an existing debt.
      await prisma.customer.update({
        where: { id: invoiceToDelete.customerId },
        data: {
          balance: {
            decrement: invoiceToDelete.balanceDue,
          },
        },
      });

      // 1.3. Delete associated InvoiceItems
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: invoiceId },
      });

      // 1.4. Delete the Invoice itself
      await prisma.invoice.delete({
        where: { id: invoiceId },
      });
    });

    return NextResponse.json({ message: 'Invoice deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error(`Error deleting invoice ${invoiceId}:`, error);
    return NextResponse.json({ error: 'Failed to delete invoice', details: error.message || 'Unknown error' }, { status: 500 });
  }
}