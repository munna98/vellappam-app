// src/types/index.ts
/* eslint-disable @typescript-eslint/no-unused-vars */ // ⭐ Added to ignore unused variables for type definitions

import {
  Prisma,
} from '@prisma/client';

// Extends the base Prisma Payment type to include its relations
// Using Prisma.validator for robust type inference with relations
const fullPaymentWithRelations = Prisma.validator<Prisma.PaymentDefaultArgs>()({
  include: {
    customer: true,
    paymentAllocations: {
      include: {
        invoice: true, 
      },
    },
  },
});
export type FullPayment = Prisma.PaymentGetPayload<typeof fullPaymentWithRelations>;


// Extends the base Prisma InvoiceItem type to include its product relation
// Using Prisma.validator for robust type inference with relations
const fullInvoiceItemWithProduct = Prisma.validator<Prisma.InvoiceItemDefaultArgs>()({
  include: {
    product: true,
  },
});
export type FullInvoiceItem = Prisma.InvoiceItemGetPayload<typeof fullInvoiceItemWithProduct>;


// ⭐ Updated: Extends the base Prisma Invoice type to include its items and customer relations
// Using Prisma.validator for robust type inference with relations
const fullInvoiceWithRelations = Prisma.validator<Prisma.InvoiceDefaultArgs>()({
  include: {
    customer: true,
    items: {
      include: {
        product: true, // This ensures that 'item.product' is available in FullInvoiceItem
      },
    },
  },
});
export type FullInvoice = Prisma.InvoiceGetPayload<typeof fullInvoiceWithRelations>;


// Type for displaying allocations in the frontend (no change needed here)
export interface AllocatedInvoiceDisplay {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  invoiceTotal: number;
  invoicePaidAmount: number;
}