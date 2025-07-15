// src/types/index.ts

import { Payment, Customer, Invoice, PaymentAllocation as PrismaPaymentAllocation } from '@prisma/client';

// Extends the base Prisma Payment type to include its relations
// This is used for data fetched with `include: { customer: true, paymentAllocations: { include: { invoice: true } } }`
export interface FullPayment extends Payment {
  customer: Customer;
  paymentAllocations: (PrismaPaymentAllocation & { invoice: Invoice })[];
}

// Type for displaying allocations in the frontend
export interface AllocatedInvoiceDisplay {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  invoiceTotal: number;
  invoicePaidAmount: number;
}