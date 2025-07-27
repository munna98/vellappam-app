// src/app/reports/day/page.tsx

import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, DollarSign, Users, Target, CreditCard } from 'lucide-react';
import prisma from '@/lib/prisma';
import { format } from 'date-fns';

// Simplified types
type CustomerBalance = {
  customerId: string;
  customerName: string;
  openingBalance: number;
  daysBillAmount: number;
  daysReceiptAmount: number;
  closingBalance: number;
};

type SimplifiedDayReport = {
  selectedDate: string;
  collectionSummary: {
    totalInvoiced: number;
    totalCollected: number;
    outstanding: number;
    collectionRate: number;
  };
  customerBalances: CustomerBalance[];
};

async function getSimplifiedDayReportData(date: string): Promise<SimplifiedDayReport> {
  const selectedDate = new Date(date);
  const startOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
  const endOfDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

  // Get all customers who had activity today (invoices or payments)
  const [dailyInvoices, dailyPayments, allCustomers] = await Promise.all([
    // Today's invoices
    prisma.invoice.findMany({
      where: {
        invoiceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        customerId: true,
        netAmount: true,
        paidAmount: true,
        balanceDue: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),

    // Today's payments
    prisma.payment.findMany({
      where: {
        paymentDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        customerId: true,
        amount: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),

    // Get all customers for opening balance calculation
    prisma.customer.findMany({
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  // Calculate collection summary
  const totalInvoiced = dailyInvoices.reduce((sum, inv) => sum + inv.netAmount, 0);
  const totalCollected = dailyPayments.reduce((sum, pay) => sum + pay.amount, 0);
  const outstanding = totalInvoiced - totalCollected;
  const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

  // Get unique customers who had activity today
  const activeCustomerIds = new Set([
    ...dailyInvoices.map(inv => inv.customerId),
    ...dailyPayments.map(pay => pay.customerId),
  ]);

  const customerBalances: CustomerBalance[] = [];

  for (const customerId of activeCustomerIds) {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) continue;

    // Calculate opening balance (all invoices before today minus all payments before today)
    const [totalPreviousInvoiced, previousPayments] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          customerId,
          invoiceDate: { lt: startOfDay },
        },
        _sum: { netAmount: true },
      }),

      prisma.payment.aggregate({
        where: {
          customerId,
          paymentDate: { lt: startOfDay },
        },
        _sum: { amount: true },
      }),
    ]);

    const openingBalance = (totalPreviousInvoiced._sum.netAmount || 0) - (previousPayments._sum.amount || 0);

    // Today&apos;s activity
    const daysBillAmount = dailyInvoices
      .filter(inv => inv.customerId === customerId)
      .reduce((sum, inv) => sum + inv.netAmount, 0);

    const daysReceiptAmount = dailyPayments
      .filter(pay => pay.customerId === customerId)
      .reduce((sum, pay) => sum + pay.amount, 0);

    const closingBalance = openingBalance + daysBillAmount - daysReceiptAmount;

    customerBalances.push({
      customerId,
      customerName: customer.name,
      openingBalance,
      daysBillAmount,
      daysReceiptAmount,
      closingBalance,
    });
  }

  // Sort by closing balance (highest first)
  customerBalances.sort((a, b) => b.closingBalance - a.closingBalance);

  return {
    selectedDate: date,
    collectionSummary: {
      totalInvoiced,
      totalCollected,
      outstanding,
      collectionRate,
    },
    customerBalances,
  };
}

// Loading component
function SimpleDayReportSkeleton() {
  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-10 w-40 bg-gray-200 rounded animate-pulse"></div>
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
            {[...Array(5)].map((_, j) => (
              <div key={j} className="h-4 w-full bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main component
async function SimpleDayReportContent({ searchParams }: { searchParams: { date?: string } }) {
  const selectedDate = searchParams.date || new Date().toISOString().split('T')[0];
  const data = await getSimplifiedDayReportData(selectedDate);

  return (
    <div className="container mx-auto py-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Day Report</h1>
          <p className="text-muted-foreground mt-1">
            Business summary for {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        
        {/* Date Selector */}
        <form method="GET" className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="px-3 py-2 border border-input rounded-md text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            Update
          </button>
        </form>
      </div>

      {/* Collection Summary Cards */}
      <div className="grid gap-6 grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{data.collectionSummary.totalInvoiced.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{data.collectionSummary.totalCollected.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₹{data.collectionSummary.outstanding.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.collectionSummary.collectionRate >= 80 ? 'text-green-600' : data.collectionSummary.collectionRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
              {data.collectionSummary.collectionRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Balance Details */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer Name</TableHead>
              <TableHead className="text-right">Opening Balance</TableHead>
              <TableHead className="text-right">Day&apos;s Bill</TableHead>
              <TableHead className="text-right">Day&apos;s Receipt</TableHead>
              <TableHead className="text-right">Closing Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.customerBalances.map((customer) => (
              <TableRow key={customer.customerId}>
                <TableCell className="font-medium">{customer.customerName}</TableCell>
                <TableCell className="text-right">
                  <span className={customer.openingBalance > 0 ? 'text-red-600' : customer.openingBalance < 0 ? 'text-green-600' : ''}>
                    ₹{customer.openingBalance.toFixed(2)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-blue-600">₹{customer.daysBillAmount.toFixed(2)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-green-600">₹{customer.daysReceiptAmount.toFixed(2)}</span>
                </TableCell>
                <TableCell className="text-right font-semibold">
                  <span className={customer.closingBalance > 0 ? 'text-red-600' : customer.closingBalance < 0 ? 'text-green-600' : ''}>
                    ₹{customer.closingBalance.toFixed(2)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {data.customerBalances.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No customer activity recorded for this date
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Main page component with Suspense
export default function SimpleDayReportPage({ searchParams }: { searchParams: { date?: string } }) {
  return (
    <Suspense fallback={<SimpleDayReportSkeleton />}>
      <SimpleDayReportContent searchParams={searchParams} />
    </Suspense>
  );
}