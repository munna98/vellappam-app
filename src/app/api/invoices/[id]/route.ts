// src/app/api/invoices/[id]/route.ts
import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client';

// Helper to extract ID from the URL (re-use the same logic)
function extractId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1] || null;
}

// Helper function to generate the next payment number within a transaction
async function generateNextPaymentNumber(tx: Prisma.TransactionClient): Promise<string> {
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

// PUT /api/invoices/[id]
export async function PUT(request: NextRequest) {
  const invoiceId = extractId(request);
  if (!invoiceId) {
    return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
  }

  try {
    const {
      customerId,
      invoiceDate,
      items, // Updated list of invoice items
      totalAmount,
      discountAmount,
      paidAmount, // New total paid amount for this invoice
      notes,
    } = await request.json();

    if (!customerId || !invoiceDate || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Start a Prisma transaction for atomicity
    const updatedInvoice = await prisma.$transaction(
      async (tx) => {
        // 1. Fetch the existing invoice and its customer with necessary details
        const existingInvoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            customer: true,
            items: true,
            paymentAllocations: true,
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
        if (newInvoiceBalanceDue <= 0.001) { // If balance is zero or negligible, it's PAID
          newStatus = InvoiceStatus.PAID;
        } else { // Otherwise, it's PENDING (even if partially paid, as there's still a balance)
          newStatus = InvoiceStatus.PENDING;
        }

        // Optional: Add validation for paidAmount to prevent decrease if not intended
        // If you intend `paidAmount` to only increase or stay same, uncomment this:
        // if ((paidAmount || 0) < oldInvoicePaidAmount) {
        //   throw new Error("The new total paid amount cannot be less than the existing paid amount.");
        // }

        // 2. Adjust customer's overall balance
        const balanceDueChange = newInvoiceBalanceDue - oldInvoiceBalanceDue;

        await tx.customer.update({
          where: { id: existingInvoice.customerId },
          data: {
            balance: existingInvoice.customer.balance + balanceDueChange,
          },
        });

        // 3. Sync invoice items (delete old, create new, update existing)
        const existingItemIds = new Set(existingInvoice.items.map(item => item.id));
        const incomingItemIds = new Set(items.map((item: { id?: string }) => item.id).filter(Boolean));

        const itemsToDelete = existingInvoice.items.filter(item => !incomingItemIds.has(item.id));

        if (itemsToDelete.length > 0) {
          await tx.invoiceItem.deleteMany({
            where: { id: { in: itemsToDelete.map(item => item.id) } },
          });
        }

        // Use Promise.all to run item updates/creates in parallel for performance, if many items
        await Promise.all(
          (items as { id?: string; productId: string; quantity: number; unitPrice: number; total: number }[]).map(async (item) => {
            const data = {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            };
            if (item.id && existingItemIds.has(item.id)) {
              await tx.invoiceItem.update({
                where: { id: item.id },
                data: data,
              });
            } else {
              await tx.invoiceItem.create({
                data: { ...data, invoiceId: invoiceId },
              });
            }
          })
        );


        // 4. Handle Payment creation/allocation if paidAmount has increased
        const paymentDifference = (paidAmount || 0) - oldInvoicePaidAmount;

        if (paymentDifference > 0) {
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

        // 5. Update the Invoice record itself
        const updatedInvoiceRecord = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            customerId,
            invoiceDate: new Date(invoiceDate),
            totalAmount,
            discountAmount: discountAmount || 0,
            netAmount: newInvoiceNetAmount,
            paidAmount: paidAmount || 0,
            balanceDue: newInvoiceBalanceDue,
            status: newStatus, // Use the new status
            notes,
          },
          include: {
            customer: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        return updatedInvoiceRecord;
      },
      {
        maxWait: 10000, // Increase maxWait to 10 seconds (time to acquire connection)
        timeout: 10000, // Increase timeout to 10 seconds (time for transaction to complete)
      }
    );

    return NextResponse.json(updatedInvoice);
  } catch (error: unknown) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice', details: (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

// DELETE /api/invoices/[id] - Delete an invoice (No changes needed here as status isn't directly set)
export async function DELETE(request: NextRequest) {
  const invoiceId = extractId(request);
  if (!invoiceId) {
    return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
  }

  try {
    // 1. Fetch invoice details needed for customer balance adjustment
    const invoiceToDelete = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        customerId: true,
        netAmount: true,
        balanceDue: true,
      },
    });

    if (!invoiceToDelete) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1.1. Delete associated PaymentAllocations first
      await tx.paymentAllocation.deleteMany({
        where: { invoiceId: invoiceId },
      });

      // 1.2. Adjust customer balance
      await tx.customer.update({
        where: { id: invoiceToDelete.customerId },
        data: {
          balance: {
            decrement: invoiceToDelete.balanceDue,
          },
        },
      });

      // 1.3. Delete associated InvoiceItems
      await tx.invoiceItem.deleteMany({
        where: { invoiceId: invoiceId },
      });

      // 1.4. Delete the Invoice itself
      await tx.invoice.delete({
        where: { id: invoiceId },
      });
    });

    return NextResponse.json({ message: 'Invoice deleted successfully' }, { status: 200 });
  } catch (error: unknown) {
    console.error(`Error deleting invoice ${invoiceId}:`, error);
    return NextResponse.json({ error: 'Failed to delete invoice', details: (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 });
  }
}