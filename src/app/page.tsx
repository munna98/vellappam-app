// src/app/page.tsx
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Users, Package, DollarSign, FileText } from 'lucide-react';
import prisma from '@/lib/prisma'; // Import Prisma client

async function getDashboardData() {
  // Use Prisma to fetch data for the dashboard cards
  const totalCustomers = await prisma.customer.count();
  const totalProducts = await prisma.product.count();
  const totalInvoices = await prisma.invoice.count();
  const totalBalance = await prisma.customer.aggregate({
    _sum: { balance: true },
  });
  const outstandingBalance = totalBalance._sum.balance || 0;

  return {
    totalCustomers,
    totalProducts,n
    totalInvoices,
    outstandingBalance,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total registered clients
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalProducts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Items available for sale
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalInvoices}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All invoices created
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{data.outstandingBalance.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total amount due from all customers
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}