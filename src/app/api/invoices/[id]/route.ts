// src/app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client'; // Make sure InvoiceStatus is imported

// Helper function to generate the next payment number (needed for PUT also)
// This should ideally be in a shared utility file if used across multiple API routes.
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
      totalAmount: newSubtotal,
      discountAmount: newDiscountAmount,
      paidAmount: newPaidAmountFromFrontend, // The paid amount sent from the frontend
    } = await request.json();

    // 1. Basic validation
    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required.' }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'At least one invoice item is required.' }, { status: 400 });
    }

    // 2. Fetch the current state of the invoice
    const oldInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        customerId: true,
        netAmount: true,
        paidAmount: true,
        balanceDue: true,
        status: true,
      },
    });

    if (!oldInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const oldCustomerId = oldInvoice.customerId;
    const oldBalanceDue = oldInvoice.balanceDue;
    const oldPaidAmount = oldInvoice.paidAmount;
    const oldNetAmount = oldInvoice.netAmount; // Needed to calculate net amount change

    // 3. Parse and validate new amounts from frontend
    const parsedNewSubtotal = parseFloat(newSubtotal) || 0.0;
    const parsedNewDiscountAmount = parseFloat(newDiscountAmount) || 0.0;
    const parsedNewPaidAmountFromFrontend = parseFloat(newPaidAmountFromFrontend) || 0.0;

    // Ensure discount doesn't exceed subtotal
    if (parsedNewDiscountAmount < 0 || parsedNewDiscountAmount > parsedNewSubtotal) {
      return NextResponse.json({ error: 'Discount amount must be between 0 and the subtotal.' }, { status: 400 });
    }

    // Calculate the new netAmount based on updated items/discount
    const newCalculatedNetAmount = parsedNewSubtotal - parsedNewDiscountAmount;

    // Validate paid amount from frontend: It cannot be negative or less than what was already paid
    // Direct reduction of paid amount is prevented; requires a separate reversal mechanism.
    if (parsedNewPaidAmountFromFrontend < oldPaidAmount) {
      return NextResponse.json({ error: 'Paid amount cannot be reduced directly. Please use a payment reversal process.' }, { status: 400 });
    }
    if (parsedNewPaidAmountFromFrontend > newCalculatedNetAmount) {
        return NextResponse.json({ error: 'Paid amount cannot exceed the Net Amount.' }, { status: 400 });
    }

    const paymentDifference = parsedNewPaidAmountFromFrontend - oldPaidAmount; // Amount to be newly paid

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

    // 4. Perform transaction to update invoice, create payment/allocation (if new payment), and adjust customer balance
    const result = await prisma.$transaction(async (prisma) => {
      let currentInvoicePaidAmount = oldPaidAmount; // This will be updated if a new payment is made
      let currentInvoiceBalanceDue = oldInvoice.balanceDue; // This will be updated
      let currentInvoiceStatus = oldInvoice.status; // This will be updated

      // If there's an additional payment, create a Payment and Allocation
      if (paymentDifference > 0) {
        const nextPaymentNumber = await generateNextPaymentNumber();

        const payment = await prisma.payment.create({
          data: {
            paymentNumber: nextPaymentNumber,
            customerId: customerId, // Use the potentially new customerId
            amount: paymentDifference,
            paymentDate: new Date(), // Payment date is now
            notes: `Additional payment for Invoice ${oldInvoice.invoiceNumber} during edit.`,
          },
        });

        await prisma.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoiceId,
            allocatedAmount: paymentDifference,
          },
        });

        // Update invoice's paidAmount and balanceDue based on this new payment
        currentInvoicePaidAmount += paymentDifference;
        currentInvoiceBalanceDue -= paymentDifference;

        // Update customer balance: Decrement by the new payment amount
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            balance: {
              decrement: paymentDifference,
            },
          },
        });
      }

      // Determine new invoice status based on the updated balanceDue
      if (currentInvoiceBalanceDue <= 0) {
        currentInvoiceStatus = InvoiceStatus.PAID;
      } else {
        currentInvoiceStatus = InvoiceStatus.PENDING; // Could be PARTIAL if you have that status
      }


      // Update the Invoice record with all new details (including potentially updated paidAmount/balanceDue)
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : oldInvoice.invoiceDate,
          totalAmount: parsedNewSubtotal,
          discountAmount: parsedNewDiscountAmount,
          netAmount: newCalculatedNetAmount,
          paidAmount: currentInvoicePaidAmount, // Use the updated paid amount
          balanceDue: currentInvoiceBalanceDue, // Use the updated balance due
          status: currentInvoiceStatus, // Use the updated status
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

      // Adjust customer balance for changes in the invoice's NET AMOUNT (due to item/discount changes)
      // This is separate from payment adjustments.
      const netAmountChange = newCalculatedNetAmount - oldNetAmount;
      if (netAmountChange !== 0) {
          if (customerId === oldCustomerId) {
              // If customer is same, just adjust their balance by the net amount change
              await prisma.customer.update({
                  where: { id: customerId },
                  data: {
                      balance: {
                          increment: netAmountChange, // Positive if net amount increased, negative if decreased
                      },
                  },
              });
          } else {
              // If customer changed, revert old net amount from old customer
              await prisma.customer.update({
                  where: { id: oldCustomerId },
                  data: {
                      balance: {
                          decrement: oldNetAmount,
                      },
                  },
              });
              // Add new net amount to new customer
              await prisma.customer.update({
                  where: { id: customerId },
                  data: {
                      balance: {
                          increment: newCalculatedNetAmount,
                      },
                  },
              });
          }
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
        netAmount: true, // Crucial: This is the value that was added to the customer's debt
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
      // The invoice's `netAmount` represents a debt that was added to the customer's balance.
      // When the invoice is deleted, this debt is removed.
      // So, the customer's balance should be DECREMENTED by the invoice's netAmount.
      // Any payments made (which are still in the system) will then implicitly cause a credit
      // for the customer if they no longer cover an existing debt.
      await prisma.customer.update({
        where: { id: invoiceToDelete.customerId },
        data: {
          balance: {
            decrement: invoiceToDelete.netAmount,
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