// src/app/reports/customer-ledger/page.tsx

import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, DollarSign, FileText, CreditCard, User, TrendingUp, TrendingDown } from 'lucide-react';
import prisma from '@/lib/prisma';
import { format } from 'date-fns';

// Types
type LedgerTransaction = {
  id: string;
  date: Date;
  type: 'INVOICE' | 'PAYMENT';
  reference: string;
  description: string;
  debitAmount: number; // Invoice amounts
  creditAmount: number; // Payment amounts
  balance: number; // Running balance
  invoiceId?: string;
  paymentId?: string;
};

type CustomerLedgerReport = {
  customerId: string;
  customerName: string;
  customerCode: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  totalInvoiced: number;
  totalPaid: number;
  transactions: LedgerTransaction[];
  summary: {
    totalDebits: number;
    totalCredits: number;
    netChange: number;
  };
};

async function getCustomerLedgerData(
  customerId: string,
  fromDate: string,
  toDate: string
): Promise<CustomerLedgerReport> {
  const startDate = new Date(fromDate);
  const endDate = new Date(toDate);
  endDate.setHours(23, 59, 59, 999); // End of day

  // Get customer details
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      code: true,
    },
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  // Calculate opening balance (all invoices before start date minus all payments before start date)
  const [openingInvoices, openingPayments] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        customerId,
        invoiceDate: { lt: startDate },
      },
      _sum: { netAmount: true },
    }),
    prisma.payment.aggregate({
      where: {
        customerId,
        paymentDate: { lt: startDate },
      },
      _sum: { amount: true },
    }),
  ]);

  const openingBalance = (openingInvoices._sum.netAmount || 0) - (openingPayments._sum.amount || 0);

  // Get all transactions within the date range
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        customerId,
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        netAmount: true,
        notes: true,
      },
      orderBy: { invoiceDate: 'asc' },
    }),
    prisma.payment.findMany({
      where: {
        customerId,
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        notes: true,
      },
      orderBy: { paymentDate: 'asc' },
    }),
  ]);

  // Combine and sort transactions chronologically
  const allTransactions: ((typeof invoices[0] & { type: 'INVOICE' }) | (typeof payments[0] & { type: 'PAYMENT' }))[] = [
    ...invoices.map(inv => ({ ...inv, type: 'INVOICE' as const })),
    ...payments.map(pay => ({ ...pay, type: 'PAYMENT' as const })),
  ].sort((a, b) => {
    const dateA = a.type === 'INVOICE' ? a.invoiceDate : a.paymentDate;
    const dateB = b.type === 'INVOICE' ? b.invoiceDate : b.paymentDate;
    return dateA.getTime() - dateB.getTime();
  });

  // Build ledger transactions with running balance
  let runningBalance = openingBalance;
  const transactions: LedgerTransaction[] = [];

  allTransactions.forEach(transaction => {
    if (transaction.type === 'INVOICE') {
      runningBalance += transaction.netAmount;
      transactions.push({
        id: `inv-${transaction.id}`,
        date: transaction.invoiceDate,
        type: 'INVOICE',
        reference: transaction.invoiceNumber,
        description: transaction.notes || 'Invoice',
        debitAmount: transaction.netAmount,
        creditAmount: 0,
        balance: runningBalance,
        invoiceId: transaction.id,
      });
    } else {
      runningBalance -= transaction.amount;
      transactions.push({
        id: `pay-${transaction.id}`,
        date: transaction.paymentDate,
        type: 'PAYMENT',
        reference: transaction.paymentNumber,
        description: transaction.notes || 'Payment',
        debitAmount: 0,
        creditAmount: transaction.amount,
        balance: runningBalance,
        paymentId: transaction.id,
      });
    }
  });

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.netAmount, 0);
  const totalPaid = payments.reduce((sum, pay) => sum + pay.amount, 0);

  return {
    customerId,
    customerName: customer.name,
    customerCode: customer.code,
    fromDate,
    toDate,
    openingBalance,
    closingBalance: runningBalance,
    totalInvoiced,
    totalPaid,
    transactions,
    summary: {
      totalDebits: totalInvoiced,
      totalCredits: totalPaid,
      netChange: totalInvoiced - totalPaid,
    },
  };
}

async function getAllCustomers() {
  return await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: { name: 'asc' },
  });
}

// Loading component
function CustomerLedgerSkeleton() {
  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
        <div className="flex gap-4">
          <div className="h-10 w-40 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-4 w-24 bg-gray-200 rounded mb-2 animate-pulse"></div>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardContent className="p-6">
          <div className="h-6 w-32 bg-gray-200 rounded mb-4 animate-pulse"></div>
          <div className="space-y-2">
            {[...Array(8)].map((_, j) => (
              <div key={j} className="h-4 w-full bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main component
async function CustomerLedgerContent({ 
  searchParams 
}: { 
  searchParams: Promise<{ 
    customerId?: string; 
    fromDate?: string; 
    toDate?: string; 
  }> 
}) {
  const resolvedSearchParams = await searchParams;
  const [customers] = await Promise.all([getAllCustomers()]);
  
  const customerId = resolvedSearchParams.customerId || customers[0]?.id || '';
  const today = new Date().toISOString().split('T')[0];
  const fromDate = resolvedSearchParams.fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
  const toDate = resolvedSearchParams.toDate || today;

  let data: CustomerLedgerReport | null = null;
  let error: string | null = null;

  if (customerId) {
    try {
      data = await getCustomerLedgerData(customerId, fromDate, toDate);
    } catch (err) {
      error = err instanceof Error ? err.message : 'An error occurred';
    }
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Customer Ledger Report</h1>
          {data && (
            <p className="text-muted-foreground mt-1">
              {data.customerName} ({data.customerCode}) - {format(new Date(fromDate), 'MMM d, yyyy')} to {format(new Date(toDate), 'MMM d, yyyy')}
            </p>
          )}
        </div>
        
        {/* Filters */}
        <form method="GET" className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <select
              name="customerId"
              defaultValue={customerId}
              className="px-3 py-2 border border-input rounded-md text-sm min-w-[200px]"
              required
            >
              <option value="">Select Customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.code})
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              name="fromDate"
              defaultValue={fromDate}
              className="px-3 py-2 border border-input rounded-md text-sm"
              required
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              name="toDate"
              defaultValue={toDate}
              className="px-3 py-2 border border-input rounded-md text-sm"
              required
            />
          </div>
          
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            Generate Report
          </button>
        </form>
      </div>

      {error && (
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="text-red-600 text-center">{error}</div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-6 grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.openingBalance > 0 ? 'text-red-600' : data.openingBalance < 0 ? 'text-green-600' : ''}`}>
                  ₹{Math.abs(data.openingBalance).toFixed(2)}
                  {data.openingBalance > 0 && <span className="text-sm font-normal text-muted-foreground ml-1">(Dr)</span>}
                  {data.openingBalance < 0 && <span className="text-sm font-normal text-muted-foreground ml-1">(Cr)</span>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">₹{data.totalInvoiced.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Received</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">₹{data.totalPaid.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Closing Balance</CardTitle>
                {data.closingBalance > data.openingBalance ? (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${data.closingBalance > 0 ? 'text-red-600' : data.closingBalance < 0 ? 'text-green-600' : ''}`}>
                  ₹{Math.abs(data.closingBalance).toFixed(2)}
                  {data.closingBalance > 0 && <span className="text-sm font-normal text-muted-foreground ml-1">(Dr)</span>}
                  {data.closingBalance < 0 && <span className="text-sm font-normal text-muted-foreground ml-1">(Cr)</span>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transaction Details */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit (₹)</TableHead>
                      <TableHead className="text-right">Credit (₹)</TableHead>
                      <TableHead className="text-right">Balance (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Opening Balance Row */}
                    <TableRow className="bg-muted/50">
                      <TableCell>{format(new Date(fromDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Opening
                        </span>
                      </TableCell>
                      <TableCell>-</TableCell>
                      <TableCell className="font-medium">Opening Balance</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right font-semibold">
                        <span className={data.openingBalance > 0 ? 'text-red-600' : data.openingBalance < 0 ? 'text-green-600' : ''}>
                          ₹{Math.abs(data.openingBalance).toFixed(2)}
                          {data.openingBalance > 0 && <span className="text-xs ml-1">(Dr)</span>}
                          {data.openingBalance < 0 && <span className="text-xs ml-1">(Cr)</span>}
                        </span>
                      </TableCell>
                    </TableRow>

                    {/* Transaction Rows */}
                    {data.transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{format(transaction.date, 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            transaction.type === 'INVOICE' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {transaction.type === 'INVOICE' ? 'Invoice' : 'Payment'}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">{transaction.reference}</TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell className="text-right">
                          {transaction.debitAmount > 0 && (
                            <span className="text-red-600">₹{transaction.debitAmount.toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {transaction.creditAmount > 0 && (
                            <span className="text-green-600">₹{transaction.creditAmount.toFixed(2)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={transaction.balance > 0 ? 'text-red-600' : transaction.balance < 0 ? 'text-green-600' : ''}>
                            ₹{Math.abs(transaction.balance).toFixed(2)}
                            {transaction.balance > 0 && <span className="text-xs ml-1">(Dr)</span>}
                            {transaction.balance < 0 && <span className="text-xs ml-1">(Cr)</span>}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}

                    {data.transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No transactions found for the selected period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!customerId && !error && (
        <Card>
          <CardContent className="p-12 text-center">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Customer</h3>
            <p className="text-muted-foreground">
              Please select a customer from the dropdown above to view their ledger report.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Main page component with Suspense
export default function CustomerLedgerPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ 
    customerId?: string; 
    fromDate?: string; 
    toDate?: string; 
  }> 
}) {
  return (
    <Suspense fallback={<CustomerLedgerSkeleton />}>
      <CustomerLedgerContent searchParams={searchParams} />
    </Suspense>
  );
}