// src/types/index.ts

import { Payment, Customer, Invoice, PaymentAllocation as PrismaPaymentAllocation, Product, InvoiceItem as PrismaInvoiceItem } from '@prisma/client';

// Extends the base Prisma Payment type to include its relations
export interface FullPayment extends Payment {
  customer: Customer;
  paymentAllocations: (PrismaPaymentAllocation & { invoice: Invoice })[];
}

// Extends the base Prisma InvoiceItem type to include its product relation
export interface FullInvoiceItem extends PrismaInvoiceItem {
  product: Product;
}

// ⭐ New/Updated: Extends the base Prisma Invoice type to include its items and customer relations
export interface FullInvoice extends Invoice {
  customer: Customer;
  items: FullInvoiceItem[];
}


// Type for displaying allocations in the frontend (no change needed here)
export interface AllocatedInvoiceDisplay {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  invoiceTotal: number;
  invoicePaidAmount: number;
}