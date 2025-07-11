// src/app/invoices/new/page.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInvoiceStore } from "@/store/invoice-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Product, Customer } from "@prisma/client";
import { Combobox } from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
    updateItemDetails,
    removeItem,
    resetForm,
  } = useInvoiceStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductWithId[]>([]);
  const [notes, setNotes] = useState("");

  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const [unitPriceToAdd, setUnitPriceToAdd] = useState<number>(0);

  // --- Fetch Customers and Products on component mount ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, productsRes] = await Promise.all([
          fetch("/api/customers"),
          fetch("/api/products"),
        ]);

        if (!customersRes.ok || !productsRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const customersData: Customer[] = await customersRes.json();
        const productsData: ProductWithId[] = await productsRes.json();

        setCustomers(customersData);
        setProducts(productsData);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load customers or products.");
      }
    };

    fetchData();

    // Cleanup store state when component unmounts
    return () => {
      resetForm();
    };
  }, [resetForm]);

  // Update unitPriceToAdd when a product is selected in the "Add Product" combobox
  useEffect(() => {
    if (selectedProductToAdd) {
      const product = products.find((p) => p.id === selectedProductToAdd);
      if (product) {
        setUnitPriceToAdd(product.price); // Set default price from product
      }
    } else {
      setUnitPriceToAdd(0); // Reset if no product is selected
    }
  }, [selectedProductToAdd, products]);

  // Add product to the invoice items list in the Zustand store
  const handleAddProduct = () => {
    if (!selectedProductToAdd || quantityToAdd <= 0 || unitPriceToAdd <= 0) {
      toast.error("Please select a product, enter a valid quantity, and a valid unit price.");
      return;
    }

    const product = products.find((p) => p.id === selectedProductToAdd);
    if (product) {
      addItem(product, quantityToAdd, unitPriceToAdd);
      setSelectedProductToAdd(null);
      setQuantityToAdd(1);
      setUnitPriceToAdd(0); // Reset unit price after adding
    }
  };

  // Handle invoice submission
  const handleSaveInvoice = async () => {
    if (!selectedCustomer) {
      toast.error("Please select a customer.");
      return;
    }
    if (invoiceItems.length === 0) {
      toast.error("Please add at least one product to the invoice.");
      return;
    }

    const hasInvalidItems = invoiceItems.some(item => item.quantity <= 0 || item.unitPrice <= 0);
    if (hasInvalidItems) {
      toast.error("All invoice items must have positive quantity and unit price.");
      return;
    }

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          items: invoiceItems,
          totalAmount,
          notes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save invoice");
      }

      toast.success("Invoice created successfully!");
      resetForm();
      router.push("/invoices");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Error saving invoice.");
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">New Invoice</h1>
      <Card className="max-w-4xl mx-auto p-6 space-y-8">
        <CardContent className="p-0 space-y-6">
          {/* --- Customer Selection --- */}
          <div className="grid md:grid-cols-2 gap-6">
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
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={new Date().toISOString().split("T")[0]}
                readOnly
              />
            </div>
          </div>

          <Separator />

          {/* --- Product Line Items --- */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Products</h3>
            {/* UPDATED LAYOUT: Use flex for horizontal alignment with adjusted widths */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px] sm:min-w-[250px] md:min-w-[300px] space-y-2"> {/* Product Combobox - More flexible width */}
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
                  formatItemLabel={(product: ProductWithId) =>
                    `${product.name} (₹${product.price.toFixed(2)} / ${product.unit})`
                  }
                />
              </div>
              <div className="w-full sm:w-[120px] space-y-2"> {/* Unit Price Input - Fixed width on sm+ */}
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
              <div className="w-full sm:w-[80px] space-y-2"> {/* Quantity Input - Fixed width on sm+ */}
                <Label htmlFor="quantity">Qty</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantityToAdd === 0 ? '' : quantityToAdd}
                  onChange={(e) =>
                    setQuantityToAdd(parseInt(e.target.value) || 1)
                  }
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

            {/* --- Invoice Items Table --- */}
            {invoiceItems.length > 0 && (
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
                  {invoiceItems.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell>{item.productCode}</TableCell>
                      <TableCell className="font-medium">
                        {item.productName}
                      </TableCell>
                      {/* FIXED: Editable Unit Price in Table */}
                      <TableCell className="w-[120px]">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onChange={(e) =>
                            updateItemDetails(
                              item.productId,
                              undefined,
                              parseFloat(e.target.value) || 0
                            )
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
                            updateItemDetails(
                              item.productId,
                              parseInt(e.target.value) || 0,
                              undefined
                            )
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
                <span className="text-3xl font-extrabold text-primary">
                  ₹{totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={resetForm}>
                  Reset Form
                </Button>
                <Button onClick={handleSaveInvoice}>Save Invoice</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}