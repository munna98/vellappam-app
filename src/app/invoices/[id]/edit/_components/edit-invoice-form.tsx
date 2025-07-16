// src/app/invoices/[id]/edit/_components/edit-invoice-form.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Customer, Product } from '@prisma/client';
import { Combobox } from '@/components/ui/combobox';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MinusCircle } from 'lucide-react';
import { FullInvoice, FullInvoiceItem } from '@/types'; // Assuming FullInvoice has discountAmount, netAmount

interface InvoiceItemForm {
  id: string; // Unique ID for React list key (important for existing items too)
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface EditInvoiceFormProps {
  initialInvoice: FullInvoice;
}

export function EditInvoiceForm({ initialInvoice }: EditInvoiceFormProps) {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date(initialInvoice.invoiceDate).toISOString().split('T')[0]);
  const [notes, setNotes] = useState(initialInvoice.notes || '');
  const [items, setItems] = useState<InvoiceItemForm[]>(
    initialInvoice.items.map((item: FullInvoiceItem) => ({
      id: item.id, // Use existing item ID
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    }))
  );
  const [discountAmount, setDiscountAmount] = useState<number>(initialInvoice.discountAmount); // ⭐ Initialize with existing discount
  const [paidAmount, setPaidAmount] = useState<number>(initialInvoice.paidAmount); // Keep track of paid amount if editable

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, productsRes] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/products'),
        ]);

        if (!customersRes.ok || !productsRes.ok) {
          throw new Error('Failed to fetch initial data.');
        }

        const customersData: Customer[] = await customersRes.json();
        const productsData: Product[] = await productsRes.json();

        setCustomers(customersData);
        setProducts(productsData);
        setSelectedCustomer(customersData.find(c => c.id === initialInvoice.customerId) || null);
      } catch (error) {
        console.error('Error fetching initial data:', error);
        toast.error('Failed to load initial data.');
      }
    };
    fetchData();
  }, [initialInvoice.customerId]);

  const handleAddItem = () => {
    setItems((prevItems) => [
      ...prevItems,
      {
        id: crypto.randomUUID(), // New unique ID for new items
        productId: '',
        productName: '',
        quantity: 1,
        unitPrice: 0,
        total: 0,
      },
    ]);
  };

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItemForm,
    value: any
  ) => {
    const updatedItems = [...items];
    const currentItem = updatedItems[index];

    if (field === 'productId') {
      const selectedProduct = products.find((p) => p.id === value);
      if (selectedProduct) {
        currentItem.productId = selectedProduct.id;
        currentItem.productName = selectedProduct.name;
        currentItem.unitPrice = selectedProduct.price;
        currentItem.total = currentItem.quantity * selectedProduct.price;
      }
    } else if (field === 'quantity' || field === 'unitPrice') {
      currentItem[field] = parseFloat(value) || 0;
      currentItem.total = currentItem.quantity * currentItem.unitPrice;
    } else {
      currentItem[field] = value;
    }
    setItems(updatedItems);
  };

  const handleRemoveItem = (id: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));
  };

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.total, 0);
  }, [items]);

  // ⭐ Calculate Net Amount
  const netAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);


  const handleSaveInvoice = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer.');
      return;
    }
    if (items.length === 0) {
      toast.error('Please add at least one invoice item.');
      return;
    }

    const hasInvalidItems = items.some(item =>
      !item.productId || item.quantity <= 0 || item.unitPrice <= 0
    );

    if (hasInvalidItems) {
      toast.error('Please ensure all invoice items have a product, positive quantity, and positive unit price.');
      return;
    }

    // ⭐ Validation for discount
    if (discountAmount > subtotal) {
        toast.error('Discount amount cannot exceed the subtotal.');
        return;
    }

    try {
      const response = await fetch(`/api/invoices/${initialInvoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          invoiceDate,
          items: items.map(({ id, productName, ...rest }) => rest), // Remove client-only fields like 'id' and 'productName'
          notes,
          totalAmount: subtotal, // This is the subtotal
          discountAmount, // ⭐ Send discountAmount
          netAmount, // ⭐ Send netAmount
          paidAmount, // Include paidAmount for status calculation
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update invoice');
      }

      toast.success('Invoice updated successfully!');
      router.push('/invoices');
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error updating invoice.');
    }
  };

  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-6xl mx-auto p-6 space-y-8">
        <CardContent className="p-0 space-y-6">
          {/* Invoice Number and Date */}
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input
                  id="invoiceNumber"
                  value={initialInvoice.invoiceNumber}
                  className="w-[180px]"
                  disabled
                />
              </div>
            </div>
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="invoiceDate">Invoice Date</Label>
                <Input
                  id="invoiceDate"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-[2] w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="customer">Select Customer</Label>
                <Combobox
                  items={customers}
                  value={selectedCustomer?.id || null}
                  onSelect={(id) =>
                    setSelectedCustomer(customers.find((c) => c.id === id) || null)
                  }
                  placeholder="Select a customer..."
                  emptyMessage="No customer found."
                  searchPlaceholder="Search customers..."
                  displayKey="name"
                  valueKey="id"
                  formatItemLabel={(customer: Customer) =>
                    `${customer.name} (Bal: ₹${customer.balance.toFixed(2)})`
                  }
                />
              </div>
            </div>
          </div>

          {selectedCustomer && (
            <div className="mt-2 p-4 border rounded-md bg-muted/50">
              <p className="font-semibold">{selectedCustomer.name}</p>
              <p className="text-sm text-muted-foreground">{selectedCustomer.address}</p>
              <p className="text-sm text-muted-foreground">Phone: {selectedCustomer.phone}</p>
              <p className="text-sm font-bold mt-2">Current Balance: ₹{selectedCustomer.balance.toFixed(2)}</p>
            </div>
          )}

          <Separator />

          {/* Invoice Items */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Invoice Items</h3>
            {items.map((item, index) => (
              <Card key={item.id} className="p-4 relative">
                <div className="grid md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor={`product-${item.id}`}>Product</Label>
                    <Combobox
                      id={`product-${item.id}`}
                      items={products}
                      value={item.productId}
                      onSelect={(value) =>
                        handleItemChange(index, 'productId', value)
                      }
                      placeholder="Select a product..."
                      emptyMessage="No product found."
                      searchPlaceholder="Search products..."
                      displayKey="name"
                      valueKey="id"
                      formatItemLabel={(product: Product) =>
                        `${product.name} (Code: ${product.code})`
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`quantity-${item.id}`}>Quantity</Label>
                    <Input
                      id={`quantity-${item.id}`}
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(index, 'quantity', e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`unitPrice-${item.id}`}>Unit Price (₹)</Label>
                    <Input
                      id={`unitPrice-${item.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleItemChange(index, 'unitPrice', e.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center mt-3">
                  <span className="text-md font-semibold">
                    Total: ₹{item.total.toFixed(2)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(item.id)}
                    className="absolute top-2 right-2"
                  >
                    <MinusCircle className="h-5 w-5 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
            <Button variant="outline" onClick={handleAddItem}>
              Add Item
            </Button>
          </div>

          <Separator />

          {/* ⭐ Discount and Totals directly below items */}
          <div className="flex flex-col gap-2 max-w-sm ml-auto">
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Subtotal:</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {/* ⭐ Discount Input Field */}
            <div className="flex justify-between items-center w-full">
                <Label htmlFor="discountAmount" className="text-lg font-semibold">Discount (₹):</Label>
                <Input
                    id="discountAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount === 0 ? '' : discountAmount}
                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-[120px] text-right"
                />
            </div>
            {/* ⭐ Net Amount Display */}
            <div className="flex justify-between items-center text-xl font-bold text-primary">
              <span>Net Amount:</span>
              <span>₹{netAmount.toFixed(2)}</span>
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific notes for this invoice..."
            />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => router.push('/invoices')}>
              Cancel
            </Button>
            <Button onClick={handleSaveInvoice}>Save Changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}