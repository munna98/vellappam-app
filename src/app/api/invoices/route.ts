// src/app/api/invoices/route.ts
// Clean version for fresh start

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { InvoiceStatus, Prisma } from "@prisma/client";

// SIMPLE: Since we're starting fresh, we can rely on auto-increment
// But we'll still generate the string format for display
function generateInvoiceNumber(numericId: number): string {
  return `INV${numericId}`;
}

function generatePaymentNumber(numericId: number): string {
  return `PAY${numericId}`;
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

    // Basic validation
    if (!customerId || !invoiceDate || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields or no items provided" },
        { status: 400 }
      );
    }

    const newInvoice = await prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true, balance: true },
        });

        if (!customer) {
          throw new Error("Customer not found");
        }

        const currentInvoiceNetAmount = Math.max(
          0,
          totalAmount - (discountAmount || 0)
        );
        const currentInvoiceBalanceDue = Math.max(
          0,
          currentInvoiceNetAmount - (paidAmount || 0)
        );

        let status: InvoiceStatus;
        if (currentInvoiceBalanceDue <= 0.001) {
          status = InvoiceStatus.PAID;
        } else {
          status = InvoiceStatus.PENDING;
        }

        // 1. Create the Invoice (auto-increment will handle invoiceNumericId)
        const createdInvoice = await tx.invoice.create({
          data: {
            invoiceNumber: "", // We'll update this after we get the numeric ID
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

        // 2. Update the invoice number based on the auto-generated numeric ID
        const invoiceNumber = generateInvoiceNumber(createdInvoice.invoiceNumericId);
        await tx.invoice.update({
          where: { id: createdInvoice.id },
          data: { invoiceNumber },
        });

        // 3. Create Invoice Items
        const invoiceItemsToCreate = items.map(
          (item: {
            productId: string;
            quantity: number;
            unitPrice: number;
            total: number;
          }) => ({
            invoiceId: createdInvoice.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          })
        );

        await tx.invoiceItem.createMany({
          data: invoiceItemsToCreate,
        });

        // 4. Update Customer Balance
        await tx.customer.update({
          where: { id: customerId },
          data: {
            balance: customer.balance + currentInvoiceBalanceDue,
          },
        });

        // 5. Handle Payment
        if ((paidAmount || 0) > 0) {
          const newPayment = await tx.payment.create({
            data: {
              paymentNumber: "", // We'll update this after we get the numeric ID
              customerId: customerId,
              amount: paidAmount,
              paymentDate: new Date(),
              notes: `Payment for Invoice ${invoiceNumber} at creation.`,
            },
          });

          // Update payment number based on auto-generated numeric ID
          const paymentNumber = generatePaymentNumber(newPayment.paymentNumericId);
          await tx.payment.update({
            where: { id: newPayment.id },
            data: { paymentNumber },
          });

          await tx.paymentAllocation.create({
            data: {
              paymentId: newPayment.id,
              invoiceId: createdInvoice.id,
              allocatedAmount: paidAmount,
            },
          });
        }

        return { ...createdInvoice, invoiceNumber };
      },
      {
        maxWait: 10000,
        timeout: 10000,
      }
    );

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
    console.error("Error creating invoice:", error);
    return NextResponse.json(
      {
        error: "Failed to create invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") as InvoiceStatus | undefined;
    const customerId = searchParams.get("customerId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        {
          customer: {
            name: { contains: search, mode: "insensitive" },
          },
        },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }
    
    const getLatestNumber = searchParams.get("getLatestNumber");
    if (getLatestNumber === "true") {
      // Get the latest numeric ID (much more efficient)
      const lastInvoice = await prisma.invoice.findFirst({
        select: { invoiceNumericId: true },
        orderBy: { invoiceNumericId: "desc" },
      });

      const latestNumericInvoice = lastInvoice ? lastInvoice.invoiceNumericId : 0;
      return NextResponse.json({ latestNumericInvoice });
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
          invoiceNumericId: "desc", // Use numeric ID for proper ordering
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
    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch invoices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}