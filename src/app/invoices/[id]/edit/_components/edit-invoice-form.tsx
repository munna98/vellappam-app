// src/app/invoices/[id]/edit/_components/edit-invoice-form.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, X, Loader2 } from 'lucide-react';
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
import { printReactComponent } from '@/lib/print-utils';
import InvoicePrintTemplate from '@/components/invoice-print-template';
import { FullInvoice } from '@/types'; // Only FullInvoice is needed directly now
import { useInvoiceStore } from '@/store/invoice-store'; // ⭐ Import your store

interface EditInvoiceFormProps {
  initialInvoice: FullInvoice;
}

export function EditInvoiceForm({ initialInvoice }: EditInvoiceFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [shouldPrint, setShouldPrint] = useState<boolean>(true);
  const [customerBalanceBeforeThisInvoice, setCustomerBalanceBeforeThisInvoice] = useState<number>(0);

  // ⭐ Get state and actions from the Zustand store
  const {
    selectedCustomer,
    invoiceItems,
    totalAmount: subtotal, // Rename totalAmount from store to subtotal for clarity in component
    discountAmount,
    paidAmount,
    notes,
    setCustomer,
    addItem,
    updateItemDetails,
    removeItem,
    setDiscountAmount,
    setPaidAmount,
    setNotes,
    loadInvoice, // New action
    resetForm, // New action to reset
  } = useInvoiceStore();

  // Local state for product addition UI
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(0);
  const [unitPriceToAdd, setUnitPriceToAdd] = useState<number>(0);

  // Initialize store with initialInvoice data on mount
  useEffect(() => {
    if (initialInvoice) {
      loadInvoice({
        customer: initialInvoice.customer,
        items: initialInvoice.items,
        discountAmount: initialInvoice.discountAmount,
        paidAmount: initialInvoice.paidAmount,
        notes: initialInvoice.notes,
      });
      // Set initial invoice date separately as it's not part of the store's core invoice state
      setInvoiceDate(new Date(initialInvoice.invoiceDate).toISOString().split('T')[0]);
    }

    // Cleanup store on unmount if navigating away
    return () => {
      resetForm();
    };
  }, [initialInvoice, loadInvoice, resetForm]);

  // Invoice Date is managed locally as it's not part of item/amount calculation
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);


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

        // Calculate customer balance before this invoice
        const customerActualCurrentBalance = customersData.find(c => c.id === initialInvoice.customerId)?.balance || 0;
        const calculatedBalanceBeforeThisInvoice = customerActualCurrentBalance - initialInvoice.balanceDue;
        setCustomerBalanceBeforeThisInvoice(calculatedBalanceBeforeThisInvoice);

        // Set initial print preference from company info
        setShouldPrint(companyInfoData.defaultPrintOnSave ?? true);

      } catch (error) {
        console.error('Error fetching initial data:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load initial data.');
        setCustomers([]);
        setProducts([]);
      }
    };
    fetchData();
  }, [initialInvoice.customerId, initialInvoice.balanceDue]); // Dependencies for initial data fetch


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
    itemId: string | undefined, // Now takes optional ID (for new items)
    productId: string, // Product ID is also needed to find the item in the store
    field: 'quantity' | 'unitPrice',
    value: number
  ) => {
    updateItemDetails(
      itemId,
      productId,
      field === 'quantity' ? value : undefined,
      field === 'unitPrice' ? value : undefined
    );
  };

  const handleRemoveItem = (itemId: string) => {
    removeItem(itemId);
  };

  const handleAddProduct = () => {
    if (!selectedProductToAdd || quantityToAdd <= 0 || unitPriceToAdd <= 0) {
      toast.error('Please select a product, enter a valid quantity, and a valid unit price.');
      return;
    }

    const product = products.find((p) => p.id === selectedProductToAdd);
    if (product) {
      const existingItem = invoiceItems.find(item => item.productId === product.id);
      if (existingItem) {
        toast.error('Product already added. Edit the existing item in the table.');
        return;
      }

      addItem(product, quantityToAdd, unitPriceToAdd); // Use store's addItem
      setSelectedProductToAdd(null);
      setQuantityToAdd(0);
      setUnitPriceToAdd(0);
    }
  };

  const netAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  const currentBillBalanceDue = useMemo(() => {
    return Math.max(0, netAmount - paidAmount);
  }, [netAmount, paidAmount]);

  const handleSaveInvoice = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer.');
      return;
    }
    if (invoiceItems.length === 0) {
      toast.error('Please add at least one invoice item.');
      return;
    }

    const hasInvalidItems = invoiceItems.some(item =>
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

    if (paidAmount < 0 || paidAmount > netAmount) {
      toast.error('Paid amount must be between 0 and the Net Amount.');
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/invoices/${initialInvoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          invoiceDate,
          items: invoiceItems.map((item) => {
            // Only send `id` if it's an existing item (not a temporary UUID)
            const { id, ...rest } = item;
            return {
              ...rest,
              // Check if the item's ID exists in the original invoice items
              // This is crucial to distinguish new items from existing ones to be updated.
              id: initialInvoice.items.some(initialItem => initialItem.id === id) ? id : undefined,
            };
          }),
          notes,
          totalAmount: subtotal,
          discountAmount,
          paidAmount,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update invoice');
      }

      const updatedInvoice: FullInvoice = await response.json();
      toast.success('Invoice updated successfully!');

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

      router.push('/invoices');
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Error updating invoice.');
    } finally {
      setIsSaving(false);
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
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="flex-[2] w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="customer">Select Customer</Label>
                <Combobox
                  items={customers}
                  value={selectedCustomer?.id || null}
                  onSelect={(id) => setCustomer(customers.find((c) => c.id === id) || null)} // ⭐ Use store's setCustomer
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

          <Separator />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Invoice Items</h3>
            {invoiceItems.length > 0 ? ( // ⭐ Use invoiceItems from store
              <div className="overflow-x-auto">
                {/* Mobile Card View for Small Screens */}
                <div className="block sm:hidden space-y-3">
                  {invoiceItems.map((item) => (
                    <Card key={item.id} className="p-3">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.productName} <span className="text-xs text-gray-500">({item.productCode})</span></div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(item.id!)}
                            disabled={isSaving}
                            className="ml-2"
                          >
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Unit Price (₹)</Label>
                            <Input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.unitPrice === 0 ? '' : item.unitPrice}
                              onChange={(e) =>
                                handleItemUpdate(item.id, item.productId, 'unitPrice', parseFloat(e.target.value) || 0)
                              }
                              className="text-right text-sm"
                              disabled={isSaving}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qty</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity === 0 ? '' : item.quantity}
                              onChange={(e) =>
                                handleItemUpdate(item.id, item.productId, 'quantity', parseInt(e.target.value) || 1)
                              }
                              className="text-right text-sm"
                              disabled={isSaving}
                            />
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <span className="text-sm font-medium">Total: ₹{item.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Desktop Table View */}
                <Table className="hidden sm:table">
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
                    {invoiceItems.map((item) => ( // ⭐ Use invoiceItems from store
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
                              handleItemUpdate(item.id, item.productId, 'unitPrice', parseFloat(e.target.value) || 0) // ⭐ Pass item.productId
                            }
                            className="text-right"
                            disabled={isSaving}
                          />
                        </TableCell>
                        <TableCell className="w-[100px]">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) =>
                              handleItemUpdate(item.id, item.productId, 'quantity', parseInt(e.target.value) || 1) // ⭐ Pass item.productId
                            }
                            className="text-right"
                            disabled={isSaving}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          ₹{item.total.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.id!)} // ID is guaranteed for items in table
                            disabled={isSaving}
                          >
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground">No items added yet. Use the fields below to add products.</p>
            )}

            <div className="flex flex-wrap items-end gap-4 mt-4">
              <div className="flex-1 min-w-[200px] sm:min-w-[250px] md:min-w-[300px] space-y-2">
                <Label htmlFor="productToAdd">Add New Product</Label>
                <Combobox
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
                  disabled={isSaving}
                />
              </div>
              <div className="w-full sm:w-[80px] space-y-2">
                <Label htmlFor="quantityToAdd">Qty</Label>
                <Input
                  id="quantityToAdd"
                  type="number"
                  min="1"
                  value={quantityToAdd === 0 ? '' : quantityToAdd}
                  onChange={(e) => setQuantityToAdd(parseInt(e.target.value) || 0)}
                  placeholder="Qty"
                  className="text-right"
                  disabled={isSaving}
                />
              </div>
              <Button
                onClick={handleAddProduct}
                className="w-full sm:w-auto h-10 flex-shrink-0"
                disabled={isSaving}
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
                value={notes} // ⭐ Use notes from store
                onChange={(e) => setNotes(e.target.value)} // ⭐ Use store's setNotes
                placeholder="Any specific notes for this invoice..."
                disabled={isSaving}
              />
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox
                  id="shouldPrint"
                  checked={shouldPrint}
                  onCheckedChange={(checked) => setShouldPrint(Boolean(checked))}
                  disabled={isSaving}
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
                <span className="text-lg font-semibold">₹{subtotal.toFixed(2)}</span> {/* ⭐ Use subtotal from store */}
              </div>
              <div className="flex justify-between items-center w-full max-w-xs">
                <Label htmlFor="discountAmount" className="text-lg font-semibold">Discount (₹):</Label>
                <Input
                  id="discountAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount === 0 ? '' : discountAmount} // ⭐ Use discountAmount from store
                  onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)} // ⭐ Use store's setDiscountAmount
                  placeholder="0.00"
                  className="w-[120px] text-right"
                  disabled={isSaving}
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
                  value={paidAmount === 0 ? '' : paidAmount} // ⭐ Use paidAmount from store
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)} // ⭐ Use store's setPaidAmount
                  placeholder="0.00"
                  className="w-[120px] text-right"
                  disabled={isSaving}
                />
              </div>
              <div className="flex justify-between items-center w-full max-w-xs text-primary">
                <span className="text-xl font-bold">Bill Balance Due:</span>
                <span className="text-2xl font-extrabold">₹{currentBillBalanceDue.toFixed(2)}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => router.push('/invoices')}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveInvoice}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
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