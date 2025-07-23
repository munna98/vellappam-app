// src/app/api/invoices/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

async function generateNextInvoiceNumber(tx: any): Promise<string> {
  const allInvoiceNumbers = await tx.invoice.findMany({
    select: { invoiceNumber: true },
    orderBy: { createdAt: 'desc' }, // Order by creation to potentially find higher numbers faster if not truly sequential
    take: 1, // Only need the latest one to check for max
  });

  let maxNumericInvoice = 0;
  if (allInvoiceNumbers.length > 0) {
    const latestInvoiceNumber = allInvoiceNumbers[0].invoiceNumber;
    const match = latestInvoiceNumber.match(/^INV(\d+)$/);
    if (match) {
      maxNumericInvoice = parseInt(match[1], 10);
    }
  }
  
  // Also check existing numbers in case the "latest" by createdAt isn't the numerically highest due to some edge case
  // A more robust way, especially if numbers aren't strictly incremental, would be to fetch all and find max as before.
  // For simplicity and performance, if numbers are generally incremental, taking the latest is often sufficient.
  // If true global max is required, previous full fetch approach is safer.
  // Sticking to simplified for efficiency, assuming INV numbers are generally sequential.

  return `INV${maxNumericInvoice + 1}`;
}

async function generateNextPaymentNumber(tx: any): Promise<string> {
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
  return 'PAY1';
}

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

    if (!customerId || !invoiceDate || !items || items.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
      if (currentInvoiceBalanceDue <= 0) {
        status = InvoiceStatus.PAID;
      } else if ((paidAmount || 0) > 0) {
        status = InvoiceStatus.PARTIAL;
      } else {
        status = InvoiceStatus.PENDING;
      }

      const nextInvoiceNumber = await generateNextInvoiceNumber(tx);

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
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: customer.balance + currentInvoiceBalanceDue,
        },
      });

      if ((paidAmount || 0) > 0) {
        const nextPaymentNumber = await generateNextPaymentNumber(tx);
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
    });

    return NextResponse.json(newInvoice);
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') as InvoiceStatus | undefined;
    const customerId = searchParams.get('customerId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (customerId) {
      where.customerId = customerId;
    }
    
    if (status) {
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
        // Changed from invoiceDate to createdAt for "last created at the top"
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
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices', details: (error as Error).message },
      { status: 500 }
    );
  }
}