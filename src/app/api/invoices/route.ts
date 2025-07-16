// src/app/api/invoices/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateNextInvoiceNumber } from '@/lib/invoice-utils'; // Ensure this utility exists and is imported

// ... (GET method remains the same)

// POST a new invoice
export async function POST(request: Request) {
  try {
    // ⭐ Destructure new fields: discountAmount and netAmount
    const { customerId, invoiceDate, items, notes, totalAmount: subtotalAmount, discountAmount, netAmount } = await request.json();

    if (!customerId || !items || items.length === 0) {
      return NextResponse.json({ error: 'Customer and invoice items are required' }, { status: 400 });
    }

    // ⭐ Server-side validation for discount and net amount
    const parsedDiscountAmount = parseFloat(discountAmount || '0') || 0.0;
    const parsedSubtotalAmount = parseFloat(subtotalAmount || '0') || 0.0;
    const calculatedNetAmount = Math.max(0, parsedSubtotalAmount - parsedDiscountAmount);

    if (parsedDiscountAmount > parsedSubtotalAmount) {
        return NextResponse.json({ error: 'Discount amount cannot exceed subtotal amount.' }, { status: 400 });
    }
    // Optionally, you might compare `calculatedNetAmount` with `netAmount` sent from frontend
    // if (Math.abs(calculatedNetAmount - parseFloat(netAmount)) > 0.01) { /* handle mismatch */ }


    // ⭐ Server-side generation of invoice number (authoritative source)
    const nextInvoiceNumber = await generateNextInvoiceNumber();

    const result = await prisma.$transaction(async (prisma) => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: nextInvoiceNumber, // ⭐ Use server-generated number
          customerId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          totalAmount: parsedSubtotalAmount, // This is the subtotal
          discountAmount: parsedDiscountAmount, // ⭐ Save discount
          netAmount: calculatedNetAmount, // ⭐ Save calculated net amount
          notes,
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

      // Update customer balance based on the final net amount
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            decrement: calculatedNetAmount,
          },
        },
      });

      return invoice;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: 'Failed to create invoice', details: (error as Error).message }, { status: 500 });
  }
}