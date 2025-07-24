// src/app/api/invoices/[id]/route.ts
import { NextResponse, NextRequest } from 'next/server'; // Import NextRequest
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
export async function PUT(request: NextRequest) { // Changed signature: removed { params }
  const invoiceId = extractId(request); // Extract ID from request.url
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
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // 1. Fetch the existing invoice and its customer with necessary details
      const existingInvoice = await tx.invoice.findUnique({
        where: { id: invoiceId }, // Use invoiceId from extraction
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
      if (newInvoiceBalanceDue <= 0.001) {
        newStatus = InvoiceStatus.PAID;
      } else if ((paidAmount || 0) > 0) {
        newStatus = InvoiceStatus.PARTIAL;
      } else {
        newStatus = InvoiceStatus.PENDING;
      }

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

      for (const item of items as { id?: string; productId: string; quantity: number; unitPrice: number; total: number }[]) {
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
      }

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
        where: { id: invoiceId }, // Use invoiceId from extraction
        data: {
          customerId,
          invoiceDate: new Date(invoiceDate),
          totalAmount,
          discountAmount: discountAmount || 0,
          netAmount: newInvoiceNetAmount,
          paidAmount: paidAmount || 0,
          balanceDue: newInvoiceBalanceDue,
          status: newStatus,
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
    });

    return NextResponse.json(updatedInvoice);
  } catch (error: unknown) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice', details: (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

// DELETE /api/invoices/[id] - Delete an invoice
export async function DELETE(request: NextRequest) { // Changed signature: removed { params }
  const invoiceId = extractId(request); // Extract ID from request.url
  if (!invoiceId) {
    return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
  }

  try {
    // 1. Fetch invoice details needed for customer balance adjustment
    const invoiceToDelete = await prisma.invoice.findUnique({
      where: { id: invoiceId }, // Use invoiceId from extraction
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
        where: { invoiceId: invoiceId }, // Use invoiceId from extraction
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
        where: { invoiceId: invoiceId }, // Use invoiceId from extraction
      });

      // 1.4. Delete the Invoice itself
      await tx.invoice.delete({
        where: { id: invoiceId }, // Use invoiceId from extraction
      });
    });

    return NextResponse.json({ message: 'Invoice deleted successfully' }, { status: 200 });
  } catch (error: unknown) {
    console.error(`Error deleting invoice ${invoiceId}:`, error); // Use invoiceId from extraction
    return NextResponse.json({ error: 'Failed to delete invoice', details: (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 });
  }
}