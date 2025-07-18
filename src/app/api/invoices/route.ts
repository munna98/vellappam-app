// src/app/api/invoices/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// Helper function to generate the next invoice number
async function generateNextInvoiceNumber() {
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  if (!lastInvoice || !lastInvoice.invoiceNumber) {
    return 'INV1';
  }

  const match = lastInvoice.invoiceNumber.match(/^INV(\d+)$/);
  if (match) {
    const lastNumber = parseInt(match[1], 10);
    return `INV${lastNumber + 1}`;
  }
  return 'INV1'; // Fallback if format is unexpected
}

// Helper function to generate the next payment number (needed for new explicit payments)
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


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const query = searchParams.get('query');
  const orderBy = searchParams.get('orderBy') || 'createdAt';
  const direction = searchParams.get('direction') === 'asc' ? 'asc' : 'desc';
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const skip = (page - 1) * limit;

  try {
    const whereClause: any = {};
    if (customerId) {
      whereClause.customerId = customerId;
    }
    if (query) {
      whereClause.OR = [
        { invoiceNumber: { contains: query, mode: 'insensitive' } },
        { customer: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

    const [invoices, totalCount] = await prisma.$transaction([
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          [orderBy]: direction,
        },
        skip: skip,
        take: limit,
      }),
      prisma.invoice.count({ where: whereClause }),
    ]);

    return NextResponse.json({ invoices, totalCount });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices', details: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { customerId, invoiceDate, items, totalAmount, discountAmount, paidAmount, notes } = await request.json();

    // 1. Basic validation and parsing
    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required.' }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'At least one invoice item is required.' }, { status: 400 });
    }

    const parsedSubtotalAmount = parseFloat(totalAmount) || 0.0;
    const parsedDiscountAmount = parseFloat(discountAmount) || 0.0;
    const parsedPaidAmountFromForm = parseFloat(paidAmount) || 0.0; // Amount paid explicitly on form

    if (parsedDiscountAmount < 0 || parsedDiscountAmount > parsedSubtotalAmount) {
      return NextResponse.json({ error: 'Discount amount must be between 0 and the subtotal.' }, { status: 400 });
    }

    const calculatedNetAmount = parsedSubtotalAmount - parsedDiscountAmount;

    // Validate paid amount from form against net amount (can't overpay beyond net amount on form)
    if (parsedPaidAmountFromForm < 0 || parsedPaidAmountFromForm > calculatedNetAmount) {
        return NextResponse.json({ error: 'Initial paid amount from form cannot be negative or exceed the Invoice Net Amount.' }, { status: 400 });
    }

    const validatedItems = items.map((item: any) => {
      const quantity = parseInt(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      if (!item.productId || isNaN(quantity) || quantity <= 0 || isNaN(unitPrice) || unitPrice <= 0) {
        throw new Error('Invalid product item details: productId, positive quantity, and positive unit price are required for all items.');
      }
      return { productId: item.productId, quantity, unitPrice, total: quantity * unitPrice };
    });

    // 2. Generate invoice number
    const nextInvoiceNumber = await generateNextInvoiceNumber();

    // 3. Perform transaction for invoice creation and payment allocation
    const result = await prisma.$transaction(async (prisma) => {

      // Step 3.1: Create the Invoice first with initial values
      // It starts as pending, with no paid amount, and full net amount due.
      // Allocations (advance or new payment) will update these.
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: nextInvoiceNumber,
          customerId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          totalAmount: parsedSubtotalAmount,
          discountAmount: parsedDiscountAmount,
          netAmount: calculatedNetAmount,
          paidAmount: 0, // Initial state, will be updated by allocations
          balanceDue: calculatedNetAmount, // Initial state, will be updated by allocations
          status: InvoiceStatus.PENDING,
          notes,
          items: { create: validatedItems },
        },
      });

      let remainingInvoiceBalance = calculatedNetAmount;
      let totalPaidAmountOnInvoice = 0; // Accumulates amounts from advance allocations and explicit new payment

      // Step 3.2: Apply existing customer advances (from overpaid payments) first (FIFO)
      // We need to find payments that have an unallocated balance.
      // This requires calculating the sum of allocations for each payment.
      const paymentsWithUnallocatedBalance = await prisma.payment.findMany({
          where: { customerId: customerId },
          include: {
              paymentAllocations: {
                  select: { allocatedAmount: true }
              }
          },
          orderBy: { paymentDate: 'asc' } // Oldest payments first (FIFO for advance)
      });

      for (const payment of paymentsWithUnallocatedBalance) {
          if (remainingInvoiceBalance <= 0) break; // Invoice is fully covered, stop allocating

          const totalAllocatedForThisPayment = payment.paymentAllocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0);
          const unallocatedAmountInThisPayment = payment.amount - totalAllocatedForThisPayment;

          if (unallocatedAmountInThisPayment > 0) { // If there's an actual unallocated amount in this payment
              const amountFromAdvanceToApply = Math.min(unallocatedAmountInThisPayment, remainingInvoiceBalance);

              if (amountFromAdvanceToApply > 0) {
                  // Create a new PaymentAllocation for this existing payment towards the new invoice
                  await prisma.paymentAllocation.create({
                      data: {
                          paymentId: payment.id,
                          invoiceId: invoice.id,
                          allocatedAmount: amountFromAdvanceToApply,
                      },
                  });

                  // Update the current state of the invoice's balance
                  remainingInvoiceBalance -= amountFromAdvanceToApply;
                  totalPaidAmountOnInvoice += amountFromAdvanceToApply;
              }
          }
      }

      // Step 3.3: Apply explicit paidAmount from the form (if any remaining balance on invoice)
      if (parsedPaidAmountFromForm > 0 && remainingInvoiceBalance > 0) {
          const amountToApplyFromForm = Math.min(parsedPaidAmountFromForm, remainingInvoiceBalance);

          if (amountToApplyFromForm > 0) {
              const nextPaymentNum = await generateNextPaymentNumber(); // Generate new number for this NEW explicit payment

              // Create a brand new Payment record for the explicit amount from the form
              const newExplicitPayment = await prisma.payment.create({
                  data: {
                      paymentNumber: nextPaymentNum,
                      customerId: customerId,
                      amount: parsedPaidAmountFromForm, // Record the full amount from the form
                      paymentDate: invoice.invoiceDate, // Payment date same as invoice date
                      notes: `Initial payment from form for Invoice ${invoice.invoiceNumber}.`,
                  },
              });

              // Create an Allocation for this new explicit payment
              await prisma.paymentAllocation.create({
                  data: {
                      paymentId: newExplicitPayment.id,
                      invoiceId: invoice.id,
                      allocatedAmount: amountToApplyFromForm, // Allocate portion to this invoice
                  },
              });

              // Update the current state of the invoice's balance
              remainingInvoiceBalance -= amountToApplyFromForm;
              totalPaidAmountOnInvoice += amountToApplyFromForm;

              // If the explicit payment also resulted in an overpayment (i.e., parsedPaidAmountFromForm > amountToApplyFromForm)
              // This excess will remain as an unallocated amount on 'newExplicitPayment' and can be used as advance later.
          }
      }

      // Step 3.4: Finalize Invoice status and update its paidAmount/balanceDue in the database
      let finalInvoiceStatus: InvoiceStatus = InvoiceStatus.PENDING;
      if (remainingInvoiceBalance <= 0) {
          finalInvoiceStatus = InvoiceStatus.PAID;
          remainingInvoiceBalance = 0; // Ensure it's exactly 0 if fully paid
      }

      const updatedInvoice = await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
              paidAmount: totalPaidAmountOnInvoice,
              balanceDue: remainingInvoiceBalance,
              status: finalInvoiceStatus,
          },
          include: {
            items: true, // Include items for the response
            customer: true, // Include customer for the response
          },
      });

      // Step 3.5: Adjust customer balance based on the final net effect of this invoice and its allocations
      // The customer's balance changes by:
      //  (Invoice's original net amount) - (Total amount allocated to this invoice from advance + explicit payment)
      const netChangeToCustomerBalance = calculatedNetAmount - totalPaidAmountOnInvoice;

      if (netChangeToCustomerBalance !== 0) {
          await prisma.customer.update({
              where: { id: customerId },
              data: {
                  balance: {
                      increment: netChangeToCustomerBalance,
                  },
              },
          });
      }

      return updatedInvoice; // Return the fully updated invoice object
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: 'Failed to create invoice', details: error.message || 'Unknown error' }, { status: 500 });
  }
}