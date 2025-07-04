// src/app/invoices/new/page.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useInvoiceStore } from '@/store/invoice-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, X, Search } from 'lucide-react';
import { Product, Customer } from '@prisma/client';
import { Combobox } from '@/components/ui/combobox'; 
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface ProductWithId extends Product {
  id: string; // Ensure id is defined for the Combobox
}



export default function CreateInvoicePage() {
  const router = useRouter();
  const {
    selectedCustomer,
    invoiceItems,
    totalAmount,
    setCustomer,
    addItem,
    updateItemQuantity,
    removeItem,
    resetForm,
  } = useInvoiceStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductWithId[]>([]);
  const [notes, setNotes] = useState('');

  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);

  // --- Fetch Customers and Products on component mount ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, productsRes] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/products'),
        ]);

        if (!customersRes.ok || !productsRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const customersData: Customer[] = await customersRes.json();
        const productsData: ProductWithId[] = await productsRes.json();

        setCustomers(customersData);
        setProducts(productsData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load customers or products.');
      }
    };

    fetchData();

    // Cleanup store state when component unmounts
    return () => {
      resetForm();
    };
  }, [resetForm]);

  // Find the selected customer object
  const customerForCombobox = useMemo(() => {
    return customers.find(c => c.id === selectedCustomer?.id) || null;
  }, [customers, selectedCustomer]);

  // Add product to the invoice items list in the Zustand store
  const handleAddProduct = () => {
    if (!selectedProductToAdd || quantityToAdd <= 0) {
      toast.error('Please select a product and enter a valid quantity.');
      return;
    }

    const product = products.find(p => p.id === selectedProductToAdd);
    if (product) {
      addItem(product, quantityToAdd);
      // Reset product selection and quantity for next item
      setSelectedProductToAdd(null);
      setQuantityToAdd(1);
    }
  };

  // Handle invoice submission
  const handleSaveInvoice = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer.');
      return;
    }
    if (invoiceItems.length === 0) {
      toast.error('Please add at least one product to the invoice.');
      return;
    }

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          items: invoiceItems,
          totalAmount,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save invoice');
      }

      toast.success('Invoice created successfully!');
      resetForm(); // Reset the store state
      router.push('/invoices'); // Redirect to the invoices list page
    } catch (error) {
      console.error(error);
      toast.error('Error saving invoice.');
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-4xl font-bold mb-8 text-center">New Invoice</h1>
      <Card className="max-w-4xl mx-auto p-6 space-y-8">
        <CardHeader className="p-0">
          <CardTitle className="text-2xl">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-6">
          {/* --- Customer Selection --- */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="customer">Select Customer</Label>
              <Combobox
                items={customers}
                value={selectedCustomer?.id || null}
                onSelect={(id) => setCustomer(customers.find(c => c.id === id) || null)}
                placeholder="Select a customer..."
                emptyMessage="No customer found."
                searchPlaceholder="Search customers..."
                displayKey="name"
                valueKey="id"
              />
              {selectedCustomer && (
                <div className="mt-2 p-4 border rounded-md bg-muted/50">
                  <p className="font-semibold">{selectedCustomer.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedCustomer.address}</p>
                  <p className="text-sm text-muted-foreground">Phone: {selectedCustomer.phone}</p>
                </div>
              )}
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input type="date" value={new Date().toISOString().split('T')[0]} readOnly />
            </div>
          </div>

          <Separator />

          {/* --- Product Line Items --- */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Products</h3>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="product">Add Product</Label>
                <Combobox
                  items={products}
                  value={selectedProductToAdd}
                  onSelect={setSelectedProductToAdd}
                  placeholder="Select a product..."
                  emptyMessage="No product found."
                  searchPlaceholder="Search products..."
                  displayKey="name"
                  valueKey="id"
                />
              </div>
              <div className="w-full md:w-32 space-y-2">
                <Label htmlFor="quantity">Qty</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantityToAdd}
                  onChange={(e) => setQuantityToAdd(parseInt(e.target.value) || 1)}
                  placeholder="Qty"
                />
              </div>
              <Button onClick={handleAddProduct} className="w-full md:w-auto h-10 mt-2 md:mt-0">
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            </div>

            {/* --- Invoice Items Table --- */}
            {invoiceItems.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceItems.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell>{item.productCode}</TableCell>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="text-right">₹{item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="w-[100px]">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value) || 0)}
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">₹{item.total.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.productId)}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <Separator />

          {/* --- Totals and Notes --- */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes for the invoice..."
              />
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <div className="flex justify-between items-center w-full max-w-xs">
                <span className="text-xl font-bold">Grand Total:</span>
                <span className="text-3xl font-extrabold text-primary">₹{totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={resetForm}>Reset Form</Button>
                <Button onClick={handleSaveInvoice}>Save Invoice</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}