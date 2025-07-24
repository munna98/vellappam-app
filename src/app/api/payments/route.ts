// src/app/api/payments/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client'; // ⭐ Import Prisma client types

// Helper function to generate the next payment number
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
  const query = searchParams.get('query'); // For general search
  const orderBy = searchParams.get('orderBy') || 'createdAt'; // Default orderBy to 'createdAt'
  const direction = searchParams.get('direction') === 'asc' ? 'asc' : 'desc'; // Default direction to 'desc'
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const skip = (page - 1) * limit;

  try {
    // ⭐ Correctly type whereClause using Prisma.PaymentWhereInput
    // This type understands nested relations like 'customer.name'
    const whereClause: Prisma.PaymentWhereInput = {};

    if (customerId) {
      whereClause.customerId = customerId;
    }
    if (query) {
      whereClause.OR = [
        { paymentNumber: { contains: query, mode: 'insensitive' } },
        // ⭐ This is now correctly typed due to Prisma.PaymentWhereInput
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
        // ⭐ Use Prisma.SortOrder for direction for better type safety
        orderBy: {
          [orderBy]: direction as Prisma.SortOrder,
        },
        skip: skip,
        take: limit,
      }),
      prisma.payment.count({ where: whereClause }),
    ]);

    // Transform payments to flatten allocations for display
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

    // 1. Basic validation
    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required.' }, { status: 400 });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Payment amount must be a positive number.' }, { status: 400 });
    }

    // 2. Fetch all outstanding invoices for the customer, sorted by invoiceDate (FIFO)
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

    // 3. Allocate payment to invoices in FIFO order
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
        let newStatus: InvoiceStatus = InvoiceStatus.PENDING;
        if (newBalanceDue <= 0) {
          newStatus = InvoiceStatus.PAID;
        }

        invoicesToUpdate.push({
          id: invoice.id,
          paidAmount: newPaidAmount,
          balanceDue: newBalanceDue,
          status: newStatus,
        });

        remainingPaymentAmount -= amountToAllocate;
      }
    }

    // 4. Generate unique payment number
    const nextPaymentNumber = await generateNextPaymentNumber();

    // 5. Perform transactions to create payment, allocations, and update invoices/customer
    const result = await prisma.$transaction(async (prisma) => {
      // 5.1. Create the Payment record
      const payment = await prisma.payment.create({
        data: {
          paymentNumber: nextPaymentNumber,
          customerId,
          amount: parsedAmount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          notes,
        },
      });

      // 5.2. Create PaymentAllocation records and update Invoices
      for (const alloc of allocationsToCreate) {
        await prisma.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            allocatedAmount: alloc.allocatedAmount,
          },
        });
      }

      for (const invoiceUpdate of invoicesToUpdate) {
        await prisma.invoice.update({
          where: { id: invoiceUpdate.id },
          data: {
            paidAmount: invoiceUpdate.paidAmount,
            balanceDue: invoiceUpdate.balanceDue,
            status: invoiceUpdate.status,
          },
        });
      }

      // 5.3. Update the customer's overall balance
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: parsedAmount,
          },
        },
      });

      return payment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to create payment', details: errorMessage }, { status: 500 });
  }
}