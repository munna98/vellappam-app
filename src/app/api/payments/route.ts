// src/app/api/payments/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

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
    const whereClause: any = {};
    if (customerId) {
      whereClause.customerId = customerId;
    }
    if (query) {
      whereClause.OR = [
        { paymentNumber: { contains: query, mode: 'insensitive' } },
        { customer: { name: { contains: query, mode: 'insensitive' } } }, // Search by customer name
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
                  totalAmount: true, // Included for display
                  paidAmount: true, // Included for display
                  balanceDue: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: {
          [orderBy]: direction,
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
      data: formattedPayments, // Changed to 'data' to match customer API structure
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json({ error: 'Failed to fetch payments', details: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // The request body for POST remains simplified as auto-allocation happens on the backend.
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
        status: InvoiceStatus.PENDING, // Only consider pending invoices
        balanceDue: { gt: 0 }, // Only invoices with outstanding balance
      },
      orderBy: {
        invoiceDate: 'asc', // FIFO: oldest invoices first
      },
      select: {
        id: true,
        invoiceNumber: true,
        balanceDue: true,
        paidAmount: true,
        totalAmount: true, // Ensure totalAmount is selected for consistency if needed elsewhere
        netAmount: true,
      },
    });

    let remainingPaymentAmount = parsedAmount;
    const allocationsToCreate: { invoiceId: string; allocatedAmount: number }[] = [];
    const invoicesToUpdate: { id: string; paidAmount: number; balanceDue: number; status: InvoiceStatus }[] = [];

    // 3. Allocate payment to invoices in FIFO order
    for (const invoice of outstandingInvoices) {
      if (remainingPaymentAmount <= 0) break; // No more payment left

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

    // If there's still remainingPaymentAmount, it means it's an overpayment or a pre-payment
    // In a real system, you might handle this as customer credit or require it to be fully allocated.
    // For now, any unallocated amount will just reduce the customer's overall balance.

    // 4. Generate unique payment number
    const nextPaymentNumber = await generateNextPaymentNumber();

    // 5. Perform transactions to create payment, allocations, and update invoices/customer
    const result = await prisma.$transaction(async (prisma) => {
      // 5.1. Create the Payment record
      const payment = await prisma.payment.create({
        data: {
          paymentNumber: nextPaymentNumber,
          customerId,
          amount: parsedAmount, // Total payment amount received
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
      // Decrement customer balance by the total amount of this payment
      // This correctly reflects the customer owing less, even if partially unallocated
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: parsedAmount,
          },
        },
      });

      return payment; // Return the created payment object
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('Error creating payment:', error);
    return NextResponse.json({ error: 'Failed to create payment', details: error.message || 'Unknown error' }, { status: 500 });
  }
}