// src/app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// GET a single invoice
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
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
    console.error(`Error fetching invoice ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}

// PUT (Update) an invoice
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { customerId, invoiceDate, items, notes, discountAmount: rawDiscountAmount, paidAmount } = await request.json(); // ⭐ Get rawDiscountAmount and paidAmount

    if (!customerId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Customer and invoice items are required' }, { status: 400 });
    }

    const discountAmount = parseFloat(rawDiscountAmount || '0') || 0.0; // ⭐ Parse and default

    let newTotalAmountBeforeDiscount = 0;
    for (const item of items) {
      if (item.quantity <= 0 || item.unitPrice <= 0) {
        return NextResponse.json({ error: 'Quantity and Unit Price must be positive for all items' }, { status: 400 });
      }
      newTotalAmountBeforeDiscount += item.quantity * item.unitPrice;
    }

    const newNetAmount = Math.max(0, newTotalAmountBeforeDiscount - discountAmount); // ⭐ Calculate new net amount

    if (discountAmount > newTotalAmountBeforeDiscount) {
        return NextResponse.json({ error: 'Discount amount cannot exceed total amount before discount.' }, { status: 400 });
    }

    // Use transaction to ensure atomicity for balance updates
    const updatedInvoice = await prisma.$transaction(async (prisma) => {
      // Fetch the old invoice details to revert changes to customer balance
      const oldInvoice = await prisma.invoice.findUnique({
        where: { id },
        select: {
          netAmount: true, // ⭐ Use netAmount for balance calculations
          paidAmount: true,
          customerId: true,
          status: true,
        },
      });

      if (!oldInvoice) {
        throw new Error('Invoice not found for update.');
      }

      // Revert old invoice amount from customer balance
      await prisma.customer.update({
        where: { id: oldInvoice.customerId },
        data: {
          balance: {
            increment: oldInvoice.netAmount, // ⭐ Revert using old netAmount
          },
        },
      });

      // Delete old invoice items
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: id },
      });

      // Determine new invoice status
      let newStatus: InvoiceStatus = InvoiceStatus.PENDING;
      if (paidAmount && paidAmount > 0) {
        if (paidAmount >= newNetAmount) { // ⭐ Compare paidAmount with newNetAmount
          newStatus = InvoiceStatus.PAID;
        } else {
          newStatus = InvoiceStatus.PARTIAL;
        }
      }

      // Update the invoice
      const invoice = await prisma.invoice.update({
        where: { id },
        data: {
          customerId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined, // Only update if provided
          totalAmount: newTotalAmountBeforeDiscount, // ⭐ Update total amount before discount
          discountAmount: discountAmount, // ⭐ Update discount amount
          netAmount: newNetAmount, // ⭐ Update net amount
          notes: notes !== undefined ? notes : undefined, // Only update if provided
          paidAmount: paidAmount !== undefined ? paidAmount : 0, // ⭐ Update paidAmount
          status: newStatus, // Set new status
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // Update customer balance with the new invoice net amount
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: invoice.netAmount, // ⭐ Decrement using the new netAmount
          },
        },
      });

      return invoice;
    });

    return NextResponse.json(updatedInvoice);
  } catch (error: any) {
    console.error(`Error updating invoice ${params.id}:`, error);
    return NextResponse.json({ error: error.message || 'Failed to update invoice' }, { status: 500 });
  }
}

// DELETE an invoice (no changes related to discount logic here)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    await prisma.$transaction(async (prisma) => {
      const invoiceToDelete = await prisma.invoice.findUnique({
        where: { id },
        select: {
          customerId: true,
          netAmount: true, // ⭐ Use netAmount for deletion balance adjustment
          paidAmount: true,
          status: true,
          paymentAllocations: {
            select: {
              paymentId: true,
              allocatedAmount: true,
            },
          },
        },
      });

      if (!invoiceToDelete) {
        throw new Error('Invoice not found for deletion.');
      }

      // Reverse the balance impact for the customer
      await prisma.customer.update({
        where: { id: invoiceToDelete.customerId },
        data: {
          balance: {
            increment: invoiceToDelete.netAmount, // ⭐ Revert using netAmount
          },
        },
      });

      // Reverse the paidAmount from any linked payments
      for (const allocation of invoiceToDelete.paymentAllocations) {
        const payment = await prisma.payment.findUnique({
          where: { id: allocation.paymentId },
          select: {
            amount: true,
          },
        });

        if (payment) {
          // This part requires careful thought. If a payment was partially allocated to THIS invoice,
          // simply incrementing customer balance for the invoice's net amount is usually sufficient.
          // Adjusting the *payment* amount might be problematic unless the payment is fully deleted too.
          // For now, we assume deleting an invoice just frees up the payment allocation.
        }
      }

      // Delete payment allocations related to this invoice
      await prisma.paymentAllocation.deleteMany({
        where: { invoiceId: id },
      });

      // Delete invoice items first
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: id },
      });

      // Finally, delete the invoice
      await prisma.invoice.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: 'Invoice deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error(`Error deleting invoice ${params.id}:`, error);
    return NextResponse.json({ error: error.message || 'Failed to delete invoice' }, { status: 500 });
  }
}