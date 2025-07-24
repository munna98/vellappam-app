// src/app/page.tsx
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Calendar,
  Target,
  Clock,
} from 'lucide-react'; // Ensure all used icons are imported
import prisma from '@/lib/prisma';
import { InvoiceStatus } from '@prisma/client';

async function getDashboardData() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Parallel queries for better performance
  const [
    totalCustomers,
    totalProducts,
    totalInvoices,
    customerBalances,
    invoiceStats,
    recentInvoices,
    recentPayments,
    overdueInvoices,
    topCustomers,
    // monthlyRevenue // Removed as it's not used in the current UI
  ] = await Promise.all([
    // Basic counts
    prisma.customer.count(),
    prisma.product.count(),
    prisma.invoice.count(),

    // Customer balance aggregation
    prisma.customer.aggregate({
      _sum: { balance: true },
      _count: { balance: true },
    }),

    // Invoice status breakdown
    prisma.invoice.groupBy({
      by: ['status'],
      _count: { status: true },
      _sum: { netAmount: true, balanceDue: true }, // Add balanceDue sum for pending
    }),

    // Recent invoices (last 30 days)
    prisma.invoice.findMany({
      where: {
        invoiceDate: { gte: thirtyDaysAgo }
      },
      select: {
        netAmount: true,
        invoiceDate: true,
        status: true,
      }
    }),

    // Recent payments (last 30 days)
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: thirtyDaysAgo }
      },
      _sum: { amount: true },
      _count: { amount: true },
    }),

    // Overdue invoices (pending/partial for more than 30 days, assuming invoiceDate as proxy for due date)
    prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL] }, // Include partial for overdue
        invoiceDate: { lt: thirtyDaysAgo }, // Invoice created more than 30 days ago
        balanceDue: { gt: 0 } // Must still have an outstanding balance
      },
      select: {
        id: true,
        invoiceNumber: true,
        balanceDue: true,
        invoiceDate: true,
        customer: {
          select: { name: true }
        }
      },
      orderBy: { invoiceDate: 'asc' },
      take: 10
    }),

    // Top customers by outstanding balance
    prisma.customer.findMany({
      where: {
        balance: { gt: 0 } // Only customers who owe money
      },
      select: {
        name: true,
        balance: true,
        phone: true, // You might display this in a tooltip or link to customer details
      },
      orderBy: { balance: 'desc' },
      take: 5
    }),

    // Removed unused monthlyRevenue query
  ]);

  // Process invoice stats
  const invoiceBreakdown = {
    pending: 0,
    paid: 0,
    partial: 0,
    cancelled: 0,
    pendingAmount: 0, // Total balance due for pending invoices
    paidAmount: 0,    // Total netAmount for paid invoices
    partialAmount: 0, // Total balance due for partial invoices
  };

  invoiceStats.forEach(stat => {
    switch (stat.status) {
      case InvoiceStatus.PENDING:
        invoiceBreakdown.pending = stat._count.status;
        invoiceBreakdown.pendingAmount = stat._sum.balanceDue || 0;
        break;
      case InvoiceStatus.PAID:
        invoiceBreakdown.paid = stat._count.status;
        invoiceBreakdown.paidAmount = stat._sum.netAmount || 0; // Total net amount of fully paid invoices
        break;
      case InvoiceStatus.PARTIAL:
        invoiceBreakdown.partial = stat._count.status;
        invoiceBreakdown.partialAmount = stat._sum.balanceDue || 0; // Total balance due for partial invoices
        break;
      case InvoiceStatus.CANCELLED:
        invoiceBreakdown.cancelled = stat._count.status;
        break;
    }
  });

  // Calculate recent performance
  const recentInvoiceAmount = recentInvoices.reduce((sum, inv) => sum + inv.netAmount, 0);
  const recentPaymentAmount = recentPayments._sum.amount || 0;
  const collectionRate = recentInvoiceAmount > 0 ? (recentPaymentAmount / recentInvoiceAmount) * 100 : 0;

  // Calculate overdue metrics
  const totalOverdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
  const avgDaysOverdue = overdueInvoices.length > 0
    ? overdueInvoices.reduce((sum, inv) => {
        const daysOverdue = Math.floor((now.getTime() - inv.invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
        return sum + daysOverdue;
      }, 0) / overdueInvoices.length
    : 0;

  return {
    // Basic metrics
    totalCustomers,
    totalProducts,
    totalInvoices,
    outstandingBalance: customerBalances._sum.balance || 0,

    // Invoice breakdown
    invoiceBreakdown,

    // Recent performance
    recentInvoiceCount: recentInvoices.length,
    recentInvoiceAmount,
    recentPaymentCount: recentPayments._count.amount || 0,
    recentPaymentAmount,
    collectionRate,

    // Overdue metrics
    overdueCount: overdueInvoices.length,
    totalOverdueAmount,
    avgDaysOverdue: Math.round(avgDaysOverdue),

    // Top customers
    topCustomers,

    // Health indicators
    customersWithBalance: customerBalances._count.balance || 0,
    avgCustomerBalance: customerBalances._count.balance > 0
      ? (customerBalances._sum.balance || 0) / customerBalances._count.balance
      : 0,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Business Dashboard</h1>

      {/* Key Metrics Row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₹{data.outstandingBalance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              From {data.customersWithBalance} customers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate (30d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.collectionRate >= 80 ? 'text-green-600' : data.collectionRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
              {data.collectionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ₹{data.recentPaymentAmount.toFixed(0)} of ₹{data.recentInvoiceAmount.toFixed(0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Invoices</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{data.overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              ₹{data.totalOverdueAmount.toFixed(2)} • Avg {data.avgDaysOverdue} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity (30d)</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.recentInvoiceCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              New invoices • {data.recentPaymentCount} payments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Status and Business Health */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-600">Paid</span>
                <span className="font-semibold">{data.invoiceBreakdown.paid}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-yellow-600">Pending</span>
                <span className="font-semibold">{data.invoiceBreakdown.pending}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-orange-600">Partial</span>
                <span className="font-semibold">{data.invoiceBreakdown.partial}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Cancelled</span>
                <span className="font-semibold">{data.invoiceBreakdown.cancelled}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Business Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Total Customers</span>
                <span className="font-semibold">{data.totalCustomers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Active Products</span>
                <span className="font-semibold">{data.totalProducts}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Total Invoices</span>
                <span className="font-semibold">{data.totalInvoices}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Avg Customer Balance</span>
                <span className="font-semibold">₹{data.avgCustomerBalance.toFixed(0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Outstanding Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topCustomers.length > 0 ? (
                data.topCustomers.map((customer, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <span className="truncate flex-1 mr-2">{customer.name}</span>
                    <span className="font-semibold text-red-600">₹{customer.balance.toFixed(0)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No outstanding balances</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions / Alerts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.overdueCount > 0 && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-sm font-medium text-red-800">
                    {data.overdueCount} overdue invoices need attention
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    Total: ₹{data.totalOverdueAmount.toFixed(2)}
                  </p>
                </div>
              )}

              {data.collectionRate < 70 && (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm font-medium text-yellow-800">
                    Collection rate is below 70%
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Consider following up with customers
                  </p>
                </div>
              )}

              {data.outstandingBalance > 50000 && (
                <div className="p-3 bg-orange-50 rounded-lg">
                  <p className="text-sm font-medium text-orange-800">
                    High outstanding balance detected
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    Review credit terms and collection processes
                  </p>
                </div>
              )}

              {data.overdueCount === 0 && data.collectionRate >= 70 && data.outstandingBalance <= 50000 && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-800">
                    All metrics look healthy! 🎉
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Keep up the good work
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Target className="h-5 w-5 mr-2" />
              Quick Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800">
                  Payment Performance
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Received ₹{data.recentPaymentAmount.toFixed(0)} in last 30 days
                </p>
              </div>

              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-sm font-medium text-purple-800">
                  Invoice Velocity
                </p>
                <p className="text-xs text-purple-600 mt-1">
                  {data.recentInvoiceCount} invoices created recently
                </p>
              </div>

              <div className="p-3 bg-teal-50 rounded-lg">
                <p className="text-sm font-medium text-teal-800">
                  Customer Engagement
                </p>
                <p className="text-xs text-teal-600 mt-1">
                  {data.customersWithBalance} customers have active balances
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}