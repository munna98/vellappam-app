// src/app/invoices/[id]/edit/_components/edit-invoice-form.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, X, Check } from 'lucide-react'; // Import Check for success icon
import { Customer, Product, CompanyInfo } from '@prisma/client';
import { Combobox } from '@/components/ui/combobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react'; // Import Loader2 for loading indicator

import { printReactComponent } from '@/lib/print-utils';
import InvoicePrintTemplate from '@/components/invoice-print-template';
import { FullInvoice, FullInvoiceItem } from '@/types';


interface FormInvoiceItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
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

  const [items, setItems] = useState<FormInvoiceItem[]>(
    initialInvoice.items.map((item: FullInvoiceItem) => ({
      id: item.id,
      productName: item.product?.name || 'Unknown Product',
      productCode: item.product?.code || 'N/A',
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    }))
  );

  const [discountAmount, setDiscountAmount] = useState<number>(initialInvoice.discountAmount);
  const [paidAmount, setPaidAmount] = useState<number>(initialInvoice.paidAmount);

  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const [unitPriceToAdd, setUnitPriceToAdd] = useState<number>(0);

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [shouldPrint, setShouldPrint] = useState<boolean>(true);
  // ⭐ NEW: State for loading indicator on save button
  const [isSaving, setIsSaving] = useState<boolean>(false);
  // ⭐ NEW: State for success indicator on save button
  const [isSaved, setIsSaved] = useState<boolean>(false);


  const [customerBalanceBeforeThisInvoice, setCustomerBalanceBeforeThisInvoice] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, productsRes, companyInfoRes] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/products'),
          fetch('/api/company-info'),
        ]);

        if (!customersRes.ok || !productsRes.ok || !companyInfoRes.ok) {
          throw new Error('Failed to fetch initial data.');
        }

        const customersResponse = await customersRes.json();
        const customersData: Customer[] = Array.isArray(customersResponse.data) ? customersResponse.data : [];

        const productsResponse = await productsRes.json();
        const productsData: Product[] = Array.isArray(productsResponse.data) ? productsResponse.data : [];

        const companyInfoData: CompanyInfo = await companyInfoRes.json();

        setCustomers(customersData);
        setProducts(productsData);
        setCompanyInfo(companyInfoData);
        setSelectedCustomer(customersData.find(c => c.id === initialInvoice.customerId) || null);
        setShouldPrint(companyInfoData.defaultPrintOnSave ?? true);

        const customerActualCurrentBalance = customersData.find(c => c.id === initialInvoice.customerId)?.balance || 0;
        const calculatedBalanceBeforeThisInvoice = customerActualCurrentBalance - initialInvoice.balanceDue;
        setCustomerBalanceBeforeThisInvoice(calculatedBalanceBeforeThisInvoice);

      } catch (error: unknown) {
        console.error('Error fetching initial data:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load initial data.');
        setCustomers([]);
        setProducts([]);
      }
    };
    fetchData();
  }, [initialInvoice.customerId, initialInvoice.balanceDue]);

  useEffect(() => {
    if (selectedProductToAdd) {
      const product = products.find((p) => p.id === selectedProductToAdd);
      if (product) {
        setUnitPriceToAdd(product.price);
      }
    } else {
      setUnitPriceToAdd(0);
    }
  }, [selectedProductToAdd, products]);

  const handleItemUpdate = (
    itemId: string,
    field: 'quantity' | 'unitPrice',
    value: number
  ) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };
          updatedItem.total = (updatedItem.quantity || 0) * (updatedItem.unitPrice || 0);
          return updatedItem;
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
  };

  const handleAddProduct = () => {
    if (!selectedProductToAdd || quantityToAdd <= 0 || unitPriceToAdd <= 0) {
      toast.error('Please select a product, enter a valid quantity, and a valid unit price.');
      return;
    }

    const product = products.find((p) => p.id === selectedProductToAdd);
    if (product) {
      const existingItem = items.find(item => item.productId === product.id);
      if (existingItem) {
        toast.error('Product already added. Edit the existing item in the table.');
        return;
      }

      setItems((prevItems) => [
        ...prevItems,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          quantity: quantityToAdd,
          unitPrice: unitPriceToAdd,
          total: quantityToAdd * unitPriceToAdd,
        },
      ]);
      setSelectedProductToAdd(null);
      setQuantityToAdd(1);
      setUnitPriceToAdd(0);
    }
  };

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.total, 0);
  }, [items]);

  const netAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  const currentBillBalanceDue = useMemo(() => {
    // Ensure paidAmount does not exceed netAmount for display calculation
    return Math.max(0, netAmount - Math.min(paidAmount, netAmount));
  }, [netAmount, paidAmount]);

  const handlePaidAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseFloat(e.target.value);

    // Prevent negative input and ensure it's not NaN
    if (isNaN(value) || value < 0) {
      value = 0;
    }
    setPaidAmount(value);
  };


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

    if (discountAmount < 0 || discountAmount > subtotal) {
        toast.error('Discount amount must be between 0 and the subtotal.');
        return;
    }

    // IMPORTANT: Cap paidAmount to netAmount *before* sending to API
    const finalPaidAmount = Math.min(paidAmount, netAmount);

    if (finalPaidAmount < 0) {
      toast.error('Paid amount cannot be negative.');
      return;
    }

    // ⭐ NEW: Reset isSaved and Set loading state to true
    setIsSaved(false);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/invoices/${initialInvoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          invoiceDate,
          items: items.map((item) => {
            const { id, productName, productCode, ...rest } = item;
            return {
              ...rest,
              id: initialInvoice.items.some(initialItem => initialItem.id === id) ? id : undefined,
            };
          }),
          notes,
          totalAmount: subtotal,
          discountAmount,
          paidAmount: finalPaidAmount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update invoice');
      }

      const updatedInvoice: FullInvoice = await response.json();
      toast.success('Invoice updated successfully!');

      // ⭐ NEW: Set isSaved to true
      setIsSaved(true);

      if (shouldPrint && companyInfo) {
        printReactComponent(<InvoicePrintTemplate
          invoice={updatedInvoice}
          companyInfo={companyInfo}
          customerOldBalance={customerBalanceBeforeThisInvoice}
          currentInvoiceBalanceDue={currentBillBalanceDue}
        />, {
          title: `Invoice ${updatedInvoice.invoiceNumber}`,
        });
      } else if (!shouldPrint) {
        toast.info('Invoice saved. Printing skipped as requested.');
      } else if (!companyInfo) {
        toast.warning('Company information not set. Cannot print thermal invoice.');
      }

      // ⭐ NEW: Add a timeout before navigating away
      setTimeout(() => {
        router.push('/invoices');
        router.refresh();
      }, 1500); // 1.5 seconds to show "Saved!" message

    } catch (error: unknown) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Error updating invoice.');
      // ⭐ NEW: Ensure isSaved is false on error
      setIsSaved(false);
    } finally {
      // ⭐ NEW: Always set loading state to false after try/catch
      setIsSaving(false);
      // ⭐ NEW: If successful, set a timeout to reset isSaved after a short display
      if (isSaved) { // Only reset if it was successfully saved
        setTimeout(() => setIsSaved(false), 1500); // Reset after 1.5 seconds
      }
    }
  };

  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-6xl mx-auto p-6 space-y-8">
        <CardContent className="p-0 space-y-6">
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
                  id="customer"
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
              <p className="text-sm font-bold mt-2">Current Customer Balance: ₹{selectedCustomer.balance.toFixed(2)}</p>
            </div>
          )}

          <Separator />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Invoice Items</h3>
            {items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Unit Price (₹)</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.productCode}</TableCell>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="w-[120px]">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onChange={(e) =>
                            handleItemUpdate(item.id, 'unitPrice', parseFloat(e.target.value) || 0)
                          }
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell className="w-[100px]">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity === 0 ? '' : item.quantity}
                          onChange={(e) =>
                            handleItemUpdate(item.id, 'quantity', parseInt(e.target.value) || 1)
                          }
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{item.total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground">No items added yet. Use the fields below to add products.</p>
            )}

            <div className="flex flex-wrap items-end gap-4 mt-4">
              <div className="flex-1 min-w-[200px] sm:min-w-[250px] md:min-w-[300px] space-y-2">
                <Label htmlFor="productToAdd">Add New Product</Label>
                <Combobox
                  id="productToAdd"
                  items={products}
                  value={selectedProductToAdd}
                  onSelect={setSelectedProductToAdd}
                  placeholder="Select a product..."
                  emptyMessage="No product found."
                  searchPlaceholder="Search products..."
                  displayKey="name"
                  valueKey="id"
                  formatItemLabel={(product: Product) =>
                    `${product.name} (₹${product.price.toFixed(2)} / ${product.unit})`
                  }
                />
              </div>
              <div className="w-full sm:w-[120px] space-y-2">
                <Label htmlFor="unitPriceToAdd">Unit Price</Label>
                <Input
                  id="unitPriceToAdd"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={unitPriceToAdd === 0 ? '' : unitPriceToAdd}
                  onChange={(e) => setUnitPriceToAdd(parseFloat(e.target.value) || 0)}
                  placeholder="Price"
                  className="text-right"
                />
              </div>
              <div className="w-full sm:w-[80px] space-y-2">
                <Label htmlFor="quantityToAdd">Qty</Label>
                <Input
                  id="quantityToAdd"
                  type="number"
                  min="1"
                  value={quantityToAdd === 0 ? '' : quantityToAdd}
                  onChange={(e) => setQuantityToAdd(parseInt(e.target.value) || 1)}
                  placeholder="Qty"
                  className="text-right"
                />
              </div>
              <Button
                onClick={handleAddProduct}
                className="w-full sm:w-auto h-10 flex-shrink-0"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any specific notes for this invoice..."
              />
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox
                  id="shouldPrint"
                  checked={shouldPrint}
                  onCheckedChange={(checked) => setShouldPrint(Boolean(checked))}
                />
                <label
                  htmlFor="shouldPrint"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Print invoice after saving
                </label>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <div className="flex justify-between items-center w-full max-w-xs">
                <span className="text-lg font-semibold">Subtotal:</span>
                <span className="text-lg font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center w-full max-w-xs">
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
              <div className="flex justify-between items-center w-full max-w-xs">
                <span className="text-xl font-bold">Net Amount:</span>
                <span className="text-3xl font-extrabold text-primary">₹{netAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center w-full max-w-xs">
                <Label htmlFor="paidAmount" className="text-lg font-semibold">Paid Amount (₹):</Label>
                <Input
                  id="paidAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount === 0 ? '' : paidAmount}
                  onChange={handlePaidAmountChange}
                  placeholder="0.00"
                  className="w-[120px] text-right"
                />
              </div>
              <div className="flex justify-between items-center w-full max-w-xs text-primary">
                <span className="text-xl font-bold">Bill Balance Due:</span>
                <span className="text-2xl font-extrabold">₹{currentBillBalanceDue.toFixed(2)}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => router.push('/invoices')} disabled={isSaving}>
                  Cancel
                </Button>
                <Button onClick={handleSaveInvoice} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Invoice'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}