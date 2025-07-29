import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client';

// Helper to generate payment number from numeric ID
function generatePaymentNumber(numericId: number): string {
  return `PAY${numericId}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const query = searchParams.get('query');
  const orderBy = searchParams.get('orderBy') || 'paymentNumericId'; // Updated to use numeric ID
  const direction = searchParams.get('direction') === 'asc' ? 'asc' : 'desc';
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const skip = (page - 1) * limit;

  try {
    const whereClause: Prisma.PaymentWhereInput = {};

    if (customerId) {
      whereClause.customerId = customerId;
    }
    if (query) {
      whereClause.OR = [
        { paymentNumber: { contains: query, mode: 'insensitive' } },
        { customer: { name: { contains: query, mode: 'insensitive' } } },
        { notes: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [payments, totalCount] = await prisma.$transaction([
      prisma.payment.findMany({
        where: whereClause,
        include: {
          customer: true,
          paymentAllocations: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  totalAmount: true,
                  paidAmount: true,
                  balanceDue: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: {
          [orderBy]: direction as Prisma.SortOrder,
        },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where: whereClause }),
    ]);

    const formattedPayments = payments.map(p => ({
      ...p,
      allocatedTo: p.paymentAllocations.map(pa => ({
        invoiceId: pa.invoice.id,
        invoiceNumber: pa.invoice.invoiceNumber,
        allocatedAmount: pa.allocatedAmount,
        invoiceTotal: pa.invoice.totalAmount,
        invoicePaidAmount: pa.invoice.paidAmount,
      }))
    }));

    return NextResponse.json({
      data: formattedPayments,
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching payments:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch payments';
    return NextResponse.json({ error: 'Failed to fetch payments', details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { customerId, amount, paymentDate, notes } = await request.json();

    // Basic validation
    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required.' }, { status: 400 });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Payment amount must be a positive number.' }, { status: 400 });
    }

    // Fetch all outstanding invoices for the customer
    const outstandingInvoices = await prisma.invoice.findMany({
      where: {
        customerId: customerId,
        status: InvoiceStatus.PENDING,
        balanceDue: { gt: 0 },
      },
      orderBy: {
        invoiceDate: 'asc',
      },
      select: {
        id: true,
        invoiceNumber: true,
        balanceDue: true,
        paidAmount: true,
        totalAmount: true,
        netAmount: true,
      },
    });

    let remainingPaymentAmount = parsedAmount;
    const allocationsToCreate: { invoiceId: string; allocatedAmount: number }[] = [];
    const invoicesToUpdate: { id: string; paidAmount: number; balanceDue: number; status: InvoiceStatus }[] = [];

    // Allocate payment to invoices in FIFO order
    for (const invoice of outstandingInvoices) {
      if (remainingPaymentAmount <= 0) break;

      const amountToAllocate = Math.min(remainingPaymentAmount, invoice.balanceDue);

      if (amountToAllocate > 0) {
        allocationsToCreate.push({
          invoiceId: invoice.id,
          allocatedAmount: amountToAllocate,
        });

        const newPaidAmount = invoice.paidAmount + amountToAllocate;
        const newBalanceDue = invoice.balanceDue - amountToAllocate;
        const newStatus: InvoiceStatus = newBalanceDue <= 0.001 ? InvoiceStatus.PAID : InvoiceStatus.PENDING;

        invoicesToUpdate.push({
          id: invoice.id,
          paidAmount: newPaidAmount,
          balanceDue: newBalanceDue,
          status: newStatus,
        });

        remainingPaymentAmount -= amountToAllocate;
      }
    }

    // Perform transaction to create payment and update related records
    const result = await prisma.$transaction(async (tx) => {
      // Create the Payment record (initially with empty paymentNumber)
      const payment = await tx.payment.create({
        data: {
          paymentNumber: "", // Temporary empty string
          customerId,
          amount: parsedAmount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          notes,
        },
      });

      // Update payment number based on auto-generated numeric ID
      const paymentNumber = generatePaymentNumber(payment.paymentNumericId);
      await tx.payment.update({
        where: { id: payment.id },
        data: { paymentNumber },
      });

      // Create PaymentAllocation records
      for (const alloc of allocationsToCreate) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            allocatedAmount: alloc.allocatedAmount,
          },
        });
      }

      // Update Invoices
      for (const invoiceUpdate of invoicesToUpdate) {
        await tx.invoice.update({
          where: { id: invoiceUpdate.id },
          data: {
            paidAmount: invoiceUpdate.paidAmount,
            balanceDue: invoiceUpdate.balanceDue,
            status: invoiceUpdate.status,
          },
        });
      }

      // Update customer balance
      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: parsedAmount,
          },
        },
      });

      return { ...payment, paymentNumber }; // Return with the generated number
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to create payment', details: errorMessage }, { status: 500 });
  }
}