// src/app/api/invoices/route.ts

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus, Prisma } from '@prisma/client'; // Import Prisma for types

async function generateNextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  // Optimized: Query only the latest invoice for the highest number
  const lastInvoice = await tx.invoice.findFirst({
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: 'desc' }, // Sort by invoiceNumber descending to get the latest INVXYZ
  });

  let maxNumericInvoice = 0;
  if (lastInvoice && lastInvoice.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/^INV(\d+)$/);
    if (match) {
      maxNumericInvoice = parseInt(match[1], 10);
    }
  }
  return `INV${maxNumericInvoice + 1}`;
}

// async function generateNextPaymentNumber(tx: Prisma.TransactionClient): Promise<string> {
//   // Optimized: Query only the latest payment for the highest number
//   const lastPayment = await tx.payment.findFirst({
//     select: { paymentNumber: true },
//     orderBy: { paymentNumber: 'desc' }, // Sort by paymentNumber descending to get the latest PAYXYZ
//   });

//   if (!lastPayment || !lastPayment.paymentNumber) {
//     return 'PAY1';
//   }

//   const match = lastPayment.paymentNumber.match(/^PAY(\d+)$/);
//   if (match) {
//     const lastNumber = parseInt(match[1], 10);
//     return `PAY${lastNumber + 1}`;
//   }
//   return 'PAY1';
// }

// More efficient approach: Pre-generate payment number outside transaction
export async function POST(request: Request) {
  try {
    const {
      customerId,
      invoiceDate,
      items,
      totalAmount,
      discountAmount,
      paidAmount,
      notes,
    } = await request.json();

    // Basic validation
    if (!customerId || !invoiceDate || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields or no items provided' }, { status: 400 });
    }

    // Pre-generate payment number outside transaction if payment is needed
    let nextPaymentNumber: string | null = null;
    if ((paidAmount || 0) > 0) {
      const lastPayment = await prisma.payment.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { paymentNumber: true },
      });

      if (!lastPayment || !lastPayment.paymentNumber) {
        nextPaymentNumber = 'PAY1';
      } else {
        const match = lastPayment.paymentNumber.match(/^PAY(\d+)$/);
        if (match) {
          const lastNumber = parseInt(match[1], 10);
          nextPaymentNumber = `PAY${lastNumber + 1}`;
        } else {
          nextPaymentNumber = 'PAY1';
        }
      }
    }

    const newInvoice = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, balance: true },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      const currentInvoiceNetAmount = Math.max(0, totalAmount - (discountAmount || 0));
      const currentInvoiceBalanceDue = Math.max(0, currentInvoiceNetAmount - (paidAmount || 0));

      let status: InvoiceStatus;
      if (currentInvoiceBalanceDue <= 0.001) {
        status = InvoiceStatus.PAID;
      } else {
        status = InvoiceStatus.PENDING;
      }

      const nextInvoiceNumber = await generateNextInvoiceNumber(tx);

      // 1. Create the Invoice
      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber: nextInvoiceNumber,
          customerId,
          invoiceDate: new Date(invoiceDate),
          totalAmount,
          discountAmount: discountAmount || 0,
          netAmount: currentInvoiceNetAmount,
          paidAmount: paidAmount || 0,
          balanceDue: currentInvoiceBalanceDue,
          status,
          notes,
        },
      });

      // 2. Create Invoice Items
      const invoiceItemsToCreate = items.map((item: { productId: string; quantity: number; unitPrice: number; total: number }) => ({
        invoiceId: createdInvoice.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      }));

      await tx.invoiceItem.createMany({
        data: invoiceItemsToCreate,
      });

      // 3. Update Customer Balance
      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: customer.balance + currentInvoiceBalanceDue,
        },
      });

      // 4. Handle Payment (using pre-generated payment number)
      if ((paidAmount || 0) > 0 && nextPaymentNumber) {
        const newPayment = await tx.payment.create({
          data: {
            paymentNumber: nextPaymentNumber,
            customerId: customerId,
            amount: paidAmount,
            paymentDate: new Date(),
            notes: `Payment for Invoice ${createdInvoice.invoiceNumber} at creation.`,
          },
        });

        await tx.paymentAllocation.create({
          data: {
            paymentId: newPayment.id,
            invoiceId: createdInvoice.id,
            allocatedAmount: paidAmount,
          },
        });
      }

      return createdInvoice;
    }, {
      maxWait: 10000, // 10 seconds to start
      timeout: 15000, // 15 seconds to complete
    });

    // Fetch complete invoice with relations after transaction
    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: newInvoice.id },
      include: {
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return NextResponse.json(fullInvoice);
  } catch (error: unknown) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice', details: (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    // ⭐ IMPORTANT: If 'status' parameter is used, ensure it only ever sends 'PENDING' or 'PAID'
    const status = searchParams.get('status') as InvoiceStatus | undefined;
    const customerId = searchParams.get('customerId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (status) {
      // This will automatically filter by PENDING or PAID if those are the only options sent
      where.status = status;
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        {
          customer: {
            name: { contains: search, mode: 'insensitive' }
          }
        },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    const getLatestNumber = searchParams.get('getLatestNumber');
    if (getLatestNumber === 'true') {
      let maxNumericInvoice = 0;
      const allInvoiceNumbersForGeneration = await prisma.invoice.findMany({
          select: { invoiceNumber: true },
      });
      allInvoiceNumbersForGeneration.forEach((invoice: { invoiceNumber: string }) => {
          const match = invoice.invoiceNumber.match(/^INV(\d+)$/);
          if (match) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxNumericInvoice) {
                  maxNumericInvoice = num;
              }
          }
      });
      return NextResponse.json({ latestNumericInvoice: maxNumericInvoice });
    }

    const [invoices, totalCount] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: {
            select: { name: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip,
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      data: invoices,
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices', details: (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}