// src/app/api/invoices/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

// Helper function to generate the next invoice number
// This should be robust in a real application, potentially with locking
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const query = searchParams.get('query'); // For general search
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
      // Basic search on invoiceNumber or customer name
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
    const { customerId, invoiceDate, items, totalAmount, discountAmount, paidAmount, notes } = await request.json(); // Added paidAmount

    // 1. Basic validation
    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required.' }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'At least one invoice item is required.' }, { status: 400 });
    }

    // 2. Parse and validate amounts
    const parsedSubtotalAmount = parseFloat(totalAmount) || 0.0;
    const parsedDiscountAmount = parseFloat(discountAmount) || 0.0;
    const parsedPaidAmount = parseFloat(paidAmount) || 0.0; // Use the provided paidAmount

    // Ensure discount doesn't exceed subtotal
    if (parsedDiscountAmount < 0 || parsedDiscountAmount > parsedSubtotalAmount) {
      return NextResponse.json({ error: 'Discount amount must be between 0 and the subtotal.' }, { status: 400 });
    }

    // Calculated net amount
    const calculatedNetAmount = parsedSubtotalAmount - parsedDiscountAmount;

    // Validate paid amount against net amount
    if (parsedPaidAmount < 0 || parsedPaidAmount > calculatedNetAmount) {
        return NextResponse.json({ error: 'Paid amount cannot be negative or exceed the Net Amount.' }, { status: 400 });
    }

    const initialBalanceDue = calculatedNetAmount - parsedPaidAmount; // Calculate balance due based on initial paid amount

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

    // 3. Determine initial invoice status
    let status: InvoiceStatus = InvoiceStatus.PENDING;
    if (initialBalanceDue <= 0) {
      status = InvoiceStatus.PAID;
    }

    // 4. Generate unique invoice number
    const nextInvoiceNumber = await generateNextInvoiceNumber();

    // 5. Create invoice and update customer balance within a transaction
    const result = await prisma.$transaction(async (prisma) => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: nextInvoiceNumber,
          customerId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          totalAmount: parsedSubtotalAmount,
          discountAmount: parsedDiscountAmount,
          netAmount: calculatedNetAmount,
          paidAmount: parsedPaidAmount, // Save the provided paid amount
          balanceDue: initialBalanceDue, // Save the calculated balance due
          status: status,
          notes,
          items: {
            create: validatedItems,
          },
        },
        include: {
          items: true,
        },
      });

      // Update customer balance: Increment by the initial balanceDue of this new invoice
      // If the invoice is fully paid initially (balanceDue = 0), then customer balance doesn't change from this invoice.
      if (initialBalanceDue !== 0) {
          await prisma.customer.update({
            where: { id: customerId },
            data: {
              balance: {
                increment: initialBalanceDue,
              },
            },
          });
      }

      return invoice;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: 'Failed to create invoice', details: error.message || 'Unknown error' }, { status: 500 });
  }
}