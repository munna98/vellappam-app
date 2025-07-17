// src/app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client'; // Import InvoiceStatus enum

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const invoiceId = params.id;
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error(`Error fetching invoice ${invoiceId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch invoice', details: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const invoiceId = params.id;
  try {
    const {
      customerId,
      invoiceDate,
      items,
      notes,
      totalAmount: newSubtotal, // This is the subtotal from frontend
      discountAmount: newDiscountAmount,
      paidAmount: newPaidAmount, // Amount paid (can be updated here directly from form)
    } = await request.json();

    // 1. Basic validation
    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required.' }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'At least one invoice item is required.' }, { status: 400 });
    }

    // 2. Fetch the current state of the invoice and its associated customer
    const oldInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        customerId: true,
        netAmount: true,
        paidAmount: true,
        balanceDue: true, // Crucial to fetch the old balanceDue
        status: true, // Also fetch old status if needed for logic
      },
    });

    if (!oldInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const oldCustomerId = oldInvoice.customerId;
    const oldBalanceDue = oldInvoice.balanceDue;

    // 3. Parse and validate new amounts from frontend
    const parsedNewSubtotal = parseFloat(newSubtotal) || 0.0;
    const parsedNewDiscountAmount = parseFloat(newDiscountAmount) || 0.0;
    const parsedNewPaidAmount = parseFloat(newPaidAmount) || 0.0;

    // Ensure discount doesn't exceed subtotal
    if (parsedNewDiscountAmount < 0 || parsedNewDiscountAmount > parsedNewSubtotal) {
      return NextResponse.json({ error: 'Discount amount must be between 0 and the subtotal.' }, { status: 400 });
    }

    // Calculate the new netAmount and balanceDue for THIS invoice
    const newCalculatedNetAmount = parsedNewSubtotal - parsedNewDiscountAmount;
    const newCalculatedBalanceDue = Math.max(0, newCalculatedNetAmount - parsedNewPaidAmount); // Balance cannot be negative

    // Validate each item detail
    const validatedItems = items.map((item: any) => {
      const quantity = parseInt(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);

      if (!item.productId || isNaN(quantity) || quantity <= 0 || isNaN(unitPrice) || unitPrice <= 0) {
        throw new Error('Invalid product item details: productId, positive quantity, and positive unit price are required for all items.');
      }
      return {
        productId: item.productId,
        quantity: quantity,
        unitPrice: unitPrice,
        total: quantity * unitPrice,
      };
    });

    // 4. Determine new invoice status
    let newStatus: InvoiceStatus = InvoiceStatus.PENDING;
    if (newCalculatedBalanceDue <= 0) {
      newStatus = InvoiceStatus.PAID;
    }
    // Consider adding OVERDUE logic here if you track due dates.

    // 5. Perform transaction to update invoice and customer balance
    const result = await prisma.$transaction(async (prisma) => {
      // 5.1. Update the Invoice record
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId, // Customer can be changed
          invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined, // Update date only if provided
          totalAmount: parsedNewSubtotal,
          discountAmount: parsedNewDiscountAmount,
          netAmount: newCalculatedNetAmount,
          paidAmount: parsedNewPaidAmount,
          balanceDue: newCalculatedBalanceDue,
          status: newStatus, // Update status based on new balanceDue
          notes,
          items: {
            deleteMany: {}, // Clear existing items
            create: validatedItems, // Re-create all items
          },
        },
        include: {
          items: true,
        },
      });

      // 5.2. Adjust Customer Balance(s)
      if (customerId === oldCustomerId) {
        // If customer hasn't changed, adjust their balance by the change in this invoice's balanceDue
        const balanceDueChange = newCalculatedBalanceDue - oldBalanceDue;
        if (balanceDueChange !== 0) { // Only update if there's an actual change
          await prisma.customer.update({
            where: { id: customerId },
            data: {
              balance: {
                increment: balanceDueChange, // Add positive change, subtract negative change
              },
            },
          });
        }
      } else {
        // Customer has changed:
        // Revert old invoice's balance due from old customer's balance
        await prisma.customer.update({
          where: { id: oldCustomerId },
          data: {
            balance: {
              decrement: oldBalanceDue,
            },
          },
        });
        // Add new invoice's balance due to new customer's balance
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            balance: {
              increment: newCalculatedBalanceDue,
            },
          },
        });
      }

      return updatedInvoice;
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error(`Error updating invoice ${invoiceId}:`, error);
    return NextResponse.json({ error: 'Failed to update invoice', details: error.message || 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const invoiceId = params.id;
  try {
    // 1. Fetch invoice details needed for customer balance adjustment
    const invoiceToDelete = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        customerId: true,
        balanceDue: true, // Need this to adjust customer's balance
      },
    });

    if (!invoiceToDelete) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // 2. Perform deletion and balance adjustment in a transaction
    await prisma.$transaction(async (prisma) => {
      // 2.1. Delete associated PaymentAllocations first (if any)
      await prisma.paymentAllocation.deleteMany({
        where: { invoiceId: invoiceId },
      });

      // 2.2. Delete associated InvoiceItems
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: invoiceId },
      });

      // 2.3. Delete the Invoice itself
      await prisma.invoice.delete({
        where: { id: invoiceId },
      });

      // 2.4. Adjust customer balance: Decrement by the invoice's balanceDue
      // This ensures that if the invoice had an outstanding balance, it's removed from the customer's total owed.
      await prisma.customer.update({
        where: { id: invoiceToDelete.customerId },
        data: {
          balance: {
            decrement: invoiceToDelete.balanceDue,
          },
        },
      });
    });

    return NextResponse.json({ message: 'Invoice deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error(`Error deleting invoice ${invoiceId}:`, error);
    return NextResponse.json({ error: 'Failed to delete invoice', details: error.message || 'Unknown error' }, { status: 500 });
  }
}