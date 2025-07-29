'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useInvoiceStore } from '@/store/invoice-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, X, Loader2 } from 'lucide-react';
import { Product, Customer, Invoice } from '@prisma/client';
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

// Helper function to generate next invoice number for DISPLAY ONLY
const generateNextInvoiceNumberForDisplay = (lastInvoiceNumber: string | null): string => {
  if (!lastInvoiceNumber) {
    return 'INV1';
  }
  const match = lastInvoiceNumber.match(/^INV(\d+)$/);
  if (match) {
    const lastNumber = parseInt(match[1], 10);
    return `INV${lastNumber + 1}`;
  }
  return 'INV1';
};

// Define types for data fetched from API for print
type CompanyInfo = {
  id: string;
  businessName: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  gstin: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  upiId: string | null;
  defaultPrintOnSave: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type InvoiceItemWithProduct = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  invoiceId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  product: Product;
};

type InvoiceWithDetails = Invoice & {
  customer: Customer;
  items: InvoiceItemWithProduct[];
};

export default function CreateInvoicePage() {
  const router = useRouter();
  const {
    selectedCustomer,
    invoiceItems,
    totalAmount,
    discountAmount, // <--- Get from store
    paidAmount,     // <--- Get from store
    notes,          // <--- Get from store
    setCustomer,
    addItem,
    updateItemDetails,
    removeItem,
    setDiscountAmount, // <--- Use store action
    setPaidAmount,     // <--- Use store action
    setNotes,          // <--- Use store action
    resetForm,
  } = useInvoiceStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoiceNumberDisplay, setInvoiceNumberDisplay] = useState<string>('');
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(0);
  const [unitPriceToAdd, setUnitPriceToAdd] = useState<number>(0);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [shouldPrint, setShouldPrint] = useState<boolean>(true);

  // New state to manage saving status
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // --- Fetch Customers, Products, Last Invoice, and Company Info on component mount ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, productsRes, lastInvoiceRes, companyInfoRes] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/products'),
          fetch('/api/invoices?orderBy=createdAt&direction=desc&limit=1'),
          fetch('/api/company-info'),
        ]);

        if (!customersRes.ok || !productsRes.ok || !lastInvoiceRes.ok || !companyInfoRes.ok) {
          throw new Error('Failed to fetch initial data');
        }

        const customersResponse = await customersRes.json();
        const productsResponse = await productsRes.json();
        const lastInvoices = await lastInvoiceRes.json();
        const companyInfoData: CompanyInfo = await companyInfoRes.json();

        // Ensure .data is an array, default to empty array if not
        setCustomers(Array.isArray(customersResponse.data) ? customersResponse.data : []);
        setProducts(Array.isArray(productsResponse.data) ? productsResponse.data : []);

        setCompanyInfo(companyInfoData);
        setShouldPrint(companyInfoData.defaultPrintOnSave);

        const lastInvNumber = lastInvoices.data.length > 0 ? lastInvoices.data[0].invoiceNumber : null;
        setInvoiceNumberDisplay(generateNextInvoiceNumberForDisplay(lastInvNumber));
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load customers, products, or company info.');
        setInvoiceNumberDisplay('INV1');
        // Also reset to empty arrays on error to prevent further issues
        setCustomers([]);
        setProducts([]);
      }
    };

    fetchData();

    // Reset form state when component unmounts
    return () => {
      resetForm();
      setDiscountAmount(0); // Also reset these
      setPaidAmount(0);     // when unmounting
      setNotes('');         // to ensure clean state on re-entry
    };
  }, [resetForm, setDiscountAmount, setPaidAmount, setNotes]); // Add store actions to dependency array

  // Update unitPriceToAdd when a product is selected in the "add product" row
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

  // Calculate Net Amount for the current bill
  const netAmount = useMemo(() => {
    return Math.max(0, totalAmount - discountAmount);
  }, [totalAmount, discountAmount]);

  // Calculate Balance Due for the current bill (what's outstanding for this specific invoice)
  const currentBillBalanceDue = useMemo(() => {
    return Math.max(0, netAmount - paidAmount);
  }, [netAmount, paidAmount]);

  const handleAddProduct = () => {
    if (!selectedProductToAdd || quantityToAdd <= 0 || unitPriceToAdd <= 0) {
      toast.error('Please select a product, enter a valid quantity, and a valid unit price.');
      return;
    }

    const product = products.find((p) => p.id === selectedProductToAdd);
    if (product) {
      addItem(product, quantityToAdd, unitPriceToAdd);
      setSelectedProductToAdd(null);
      setQuantityToAdd(0);
      setUnitPriceToAdd(0);
    }
  };

  const handleSaveInvoice = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer.');
      return;
    }
    if (invoiceItems.length === 0) {
      toast.error('Please add at least one product to the invoice.');
      return;
    }

    const hasInvalidItems = invoiceItems.some(
      (item) => item.quantity <= 0 || item.unitPrice <= 0
    );
    if (hasInvalidItems) {
      toast.error('All invoice items must have positive quantity and unit price.');
      return;
    }

    // Now, discountAmount and paidAmount come directly from the store's state
    if (discountAmount < 0 || discountAmount > totalAmount) {
      toast.error('Discount amount must be between 0 and the subtotal.');
      return;
    }

    if (paidAmount < 0 || paidAmount > netAmount) {
      toast.error('Paid amount cannot be negative or exceed the Net Amount.');
      return;
    }

    setIsSaving(true); // Set saving state to true

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          invoiceDate: invoiceDate,
          items: invoiceItems.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          })),
          totalAmount: totalAmount,
          discountAmount: discountAmount,
          paidAmount: paidAmount,
          notes, // notes also directly from store
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save invoice');
      }

      const newInvoice: InvoiceWithDetails = await response.json();
      toast.success('Invoice created successfully!');

      if (shouldPrint && companyInfo) {
        printReactComponent(<InvoicePrintTemplate
          invoice={newInvoice}
          companyInfo={companyInfo}
          customerOldBalance={selectedCustomer.balance}
          currentInvoiceBalanceDue={currentBillBalanceDue}
        />, {
          title: `Invoice ${newInvoice.invoiceNumber}`,
        });
      } else if (!companyInfo) {
        toast.warning('Company information not set. Cannot print thermal invoice.');
      }

      resetForm();
      setDiscountAmount(0); // Reset these using the store actions
      setPaidAmount(0);     //
      setNotes('');         //
      setInvoiceDate(new Date().toISOString().split('T')[0]);

      // After saving, re-fetch settings to get the latest defaultPrintOnSave
      const companyInfoRes = await fetch('/api/company-info');
      if (companyInfoRes.ok) {
          const updatedCompanyInfo: CompanyInfo = await companyInfoRes.json();
          setCompanyInfo(updatedCompanyInfo);
          setShouldPrint(updatedCompanyInfo.defaultPrintOnSave ?? true);
      }

      const lastInvoiceRes = await fetch('/api/invoices?orderBy=createdAt&direction=desc&limit=1');
      const lastInvoices = await lastInvoiceRes.json();
      const lastInvNumber = lastInvoices.data.length > 0 ? lastInvoices.data[0].invoiceNumber : null;
      setInvoiceNumberDisplay(generateNextInvoiceNumberForDisplay(lastInvNumber));

      router.push('/invoices');
      router.refresh();
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Error saving invoice.';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false); // Always reset saving state
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">New Invoice</h1>
      <Card className="max-w-6xl mx-auto p-6 space-y-8">
        <CardContent className="p-0 space-y-6">
          {/* --- Invoice Number & Date & Customer Selection --- */}
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 w-full md:w-auto">
              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceNumberDisplay}
                  className="w-[120px]"
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
                    setCustomer(customers.find((c) => c.id === id) || null)
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

          <Separator />

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Products</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px] sm:min-w-[250px] md:min-w-[300px] space-y-2">
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
                  formatItemLabel={(product: Product) =>
                    `${product.name} (₹${product.price.toFixed(2)} / ${product.unit})`
                  }
                />
              </div>
              <div className="w-full sm:w-[120px] space-y-2">
                <Label htmlFor="unitPriceAdd">Unit Price</Label>
                <Input
                  id="unitPriceAdd"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={unitPriceToAdd === 0 ? '' : unitPriceToAdd}
                  onChange={(e) =>
                    setUnitPriceToAdd(parseFloat(e.target.value) || 0)
                  }
                  placeholder="Price"
                  className="text-right"
                />
              </div>
              <div className="w-full sm:w-[80px] space-y-2">
                <Label htmlFor="quantity">Qty</Label>
                <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={quantityToAdd === 0 ? '' : quantityToAdd}
                    onChange={(e) =>
                      setQuantityToAdd(parseInt(e.target.value) || 0)
                    }
                    placeholder="Qty"
                    className="text-right"
                  />
              </div>
              <Button
                onClick={handleAddProduct}
                className="w-full sm:w-auto h-10 flex-shrink-0"
                disabled={isSaving} // Disable add item button while saving
              >
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            </div>

            {invoiceItems.length > 0 && (
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
                            onClick={() => removeItem(item.id!)}
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
                                updateItemDetails(
                                  item.id,
                                  item.productId,
                                  undefined,
                                  parseFloat(e.target.value) || 0
                                )
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
                                updateItemDetails(
                                  item.id,
                                  item.productId,
                                  parseInt(e.target.value) || 0,
                                  undefined
                                )
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
                    {invoiceItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.productCode}</TableCell>
                        <TableCell className="font-medium">
                          {item.productName}
                        </TableCell>
                        <TableCell className="w-[120px]">
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.unitPrice === 0 ? '' : item.unitPrice}
                            onChange={(e) =>
                              updateItemDetails(
                                item.id,
                                item.productId,
                                undefined,
                                parseFloat(e.target.value) || 0
                              )
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
                              updateItemDetails(
                                item.id,
                                item.productId,
                                parseInt(e.target.value) || 0,
                                undefined
                              )
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
                            onClick={() => removeItem(item.id!)}
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
            )}
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes} // <--- Value from store
                onChange={(e) => setNotes(e.target.value)} // <--- Update via store action
                placeholder="Add any notes for the invoice..."
                disabled={isSaving} // Disable input while saving
              />
              <div className="flex items-center space-x-2 mt-4">
                <Checkbox
                  id="shouldPrint"
                  checked={shouldPrint}
                  onCheckedChange={(checked) => setShouldPrint(Boolean(checked))}
                  disabled={isSaving} // Disable checkbox while saving
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
                <span className="text-lg font-semibold">
                  ₹{totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center w-full max-w-xs">
                <Label htmlFor="discountAmount" className="text-lg font-semibold">Discount (₹):</Label>
                <Input
                  id="discountAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount === 0 ? '' : discountAmount} // <--- Value from store
                  onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)} // <--- Update via store action
                  placeholder="0.00"
                  className="w-[120px] text-right"
                  disabled={isSaving} // Disable input while saving
                />
              </div>
              <div className="flex justify-between items-center w-full max-w-xs">
                <span className="text-xl font-bold">Net Amount:</span>
                <span className="text-3xl font-extrabold text-primary">
                  ₹{netAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center w-full max-w-xs">
                <Label htmlFor="paidAmount" className="text-lg font-semibold">Paid Amount (₹):</Label>
                <Input
                  id="paidAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount === 0 ? '' : paidAmount} // <--- Value from store
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)} // <--- Update via store action
                  placeholder="0.00"
                  className="w-[120px] text-right"
                  disabled={isSaving} // Disable input while saving
                />
              </div>
              <div className="flex justify-between items-center w-full max-w-xs text-primary">
                <span className="text-xl font-bold">Bill Balance Due:</span>
                <span className="text-2xl font-extrabold">
                  ₹{currentBillBalanceDue.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setDiscountAmount(0); // Reset these using the store actions
                    setPaidAmount(0);     //
                    setNotes('');         //
                    setInvoiceDate(new Date().toISOString().split('T')[0]);
                    setShouldPrint(companyInfo?.defaultPrintOnSave ?? true);
                  }}
                  disabled={isSaving} // Disable reset button while saving
                >
                  Reset Form
                </Button>
                {/* --- The Save Invoice Button with Saving State --- */}
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