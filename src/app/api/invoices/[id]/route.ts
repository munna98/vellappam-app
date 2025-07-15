// src/app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// GET /api/invoices/[id] - Fetch a single invoice with its items and customer
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true, // Include full customer object
        items: {
          include: {
            product: true, // Include full product object for each item
          },
        },
        paymentAllocations: true, // Include payment allocations for this invoice
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

// PUT /api/invoices/[id] - Update an invoice
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { customerId, items, notes, invoiceNumber } = await request.json();

    // Calculate new total amount from provided items
    const newTotalAmount = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);

    if (!customerId || !Array.isArray(items) || items.length === 0 || !invoiceNumber) {
      return NextResponse.json({ error: 'Missing required fields: customerId, items, invoiceNumber' }, { status: 400 });
    }

    const updatedInvoice = await prisma.$transaction(async (prisma) => {
      // 1. Fetch the original invoice to get old total and paid amounts
      const originalInvoice = await prisma.invoice.findUnique({
        where: { id },
        select: { totalAmount: true, paidAmount: true, customerId: true, status: true },
      });

      if (!originalInvoice) {
        throw new Error('Original invoice not found for update.');
      }

      const oldTotalAmount = originalInvoice.totalAmount;
      const oldPaidAmount = originalInvoice.paidAmount;
      const oldCustomerId = originalInvoice.customerId;

      // 2. Adjust customer balance for the *difference* in total amount
      // This is crucial for maintaining correct customer balance
      const balanceDifference = newTotalAmount - oldTotalAmount;
      if (balanceDifference !== 0) {
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            balance: {
              increment: balanceDifference, // Add the positive or negative difference
            },
          },
        });
      }

      // 3. Determine new invoice status based on new total and old paid amount
      let newStatus: InvoiceStatus;
      if (oldPaidAmount >= newTotalAmount) {
        newStatus = InvoiceStatus.PAID;
      } else if (oldPaidAmount > 0) {
        newStatus = InvoiceStatus.PARTIAL;
      } else {
        newStatus = InvoiceStatus.PENDING;
      }

      // 4. Update the Invoice record
      const invoice = await prisma.invoice.update({
        where: { id },
        data: {
          invoiceNumber,
          customerId, // Allow changing customer (though rare for invoices)
          totalAmount: newTotalAmount,
          notes,
          status: newStatus,
        },
      });

      // 5. Update Invoice Items: Delete old ones, create new ones, update existing ones
      const existingItemIds = (await prisma.invoiceItem.findMany({
        where: { invoiceId: id },
        select: { id: true },
      })).map(item => item.id);

      const itemsToCreate = items.filter((item: any) => !item.id); // Items without an ID are new
      const itemsToUpdate = items.filter((item: any) => item.id); // Items with an ID are existing
      const itemIdsToKeep = itemsToUpdate.map((item: any) => item.id);
      const itemsToDelete = existingItemIds.filter(itemId => !itemIdsToKeep.includes(itemId));

      // Delete items no longer present
      if (itemsToDelete.length > 0) {
        await prisma.invoiceItem.deleteMany({
          where: {
            id: { in: itemsToDelete },
          },
        });
      }

      // Create new items
      if (itemsToCreate.length > 0) {
        await prisma.invoiceItem.createMany({
          data: itemsToCreate.map((item: any) => ({
            invoiceId: invoice.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        });
      }

      // Update existing items
      for (const item of itemsToUpdate) {
        await prisma.invoiceItem.update({
          where: { id: item.id },
          data: {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          },
        });
      }

      return invoice;
    });

    return NextResponse.json(updatedInvoice);
  } catch (error: any) {
    console.error(`Error updating invoice ${params.id}:`, error);
    if (error.code === 'P2002' && error.meta?.target?.includes('invoiceNumber')) {
      return NextResponse.json({ error: 'Invoice number already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update invoice' }, { status: 500 });
  }
}

// DELETE /api/invoices/[id] - Delete an invoice
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    await prisma.$transaction(async (prisma) => {
      // 1. Get the invoice details to adjust customer balance
      const invoiceToDelete = await prisma.invoice.findUnique({
        where: { id },
        select: { totalAmount: true, paidAmount: true, customerId: true },
      });

      if (!invoiceToDelete) {
        throw new Error('Invoice not found for deletion.');
      }

      const outstandingAmount = invoiceToDelete.totalAmount - invoiceToDelete.paidAmount;

      // 2. Adjust customer balance (decrement by outstanding amount)
      if (outstandingAmount > 0) {
        await prisma.customer.update({
          where: { id: invoiceToDelete.customerId },
          data: {
            balance: {
              decrement: outstandingAmount,
            },
          },
        });
      }

      // 3. Delete associated PaymentAllocations first (if any)
      await prisma.paymentAllocation.deleteMany({
        where: { invoiceId: id },
      });

      // 4. Delete associated InvoiceItems
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: id },
      });

      // 5. Delete the Invoice itself
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