// src/store/invoice-store.ts
import { create } from 'zustand';
import { Product, Customer } from '@prisma/client'; // Import Product and Customer from Prisma client

// Define the shape of an item in our store
interface InvoiceItem {
  productId: string;
  productCode: string; // Added productCode for display
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// Define the state and actions for the invoice store
interface InvoiceStore {
  selectedCustomer: Customer | null;
  invoiceItems: InvoiceItem[];
  totalAmount: number; // This will store the subtotal
  setCustomer: (customer: Customer | null) => void;
  addItem: (product: Product, quantity: number, unitPrice: number) => void;
  updateItemDetails: (productId: string, quantity?: number, unitPrice?: number) => void;
  removeItem: (productId: string) => void;
  resetForm: () => void;
}

// ⭐ FIX: Removed 'get' as it's unused
export const useInvoiceStore = create<InvoiceStore>((set) => ({
  selectedCustomer: null,
  invoiceItems: [],
  totalAmount: 0,

  setCustomer: (customer) => set({ selectedCustomer: customer }),

  addItem: (product, quantity, unitPrice) =>
    set((state) => {
      const existingItemIndex = state.invoiceItems.findIndex(
        (item) => item.productId === product.id
      );

      let updatedItems: InvoiceItem[];
      if (existingItemIndex > -1) {
        // If product already exists, update its quantity and unit price
        updatedItems = state.invoiceItems.map((item, index) =>
          index === existingItemIndex
            ? {
                ...item,
                quantity: item.quantity + quantity,
                unitPrice: unitPrice, // Update unit price to the new one if adding again
                total: (item.quantity + quantity) * unitPrice,
              }
            : item
        );
      } else {
        // Otherwise, add as a new item
        updatedItems = [
          ...state.invoiceItems,
          {
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            quantity: quantity,
            unitPrice: unitPrice,
            total: quantity * unitPrice,
          },
        ];
      }

      // Recalculate totalAmount (subtotal)
      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    }),

  updateItemDetails: (productId, quantity, unitPrice) =>
    set((state) => {
      const updatedItems = state.invoiceItems.map((item) => {
        if (item.productId === productId) {
          const newQuantity = quantity !== undefined ? quantity : item.quantity;
          const newUnitPrice = unitPrice !== undefined ? unitPrice : item.unitPrice;
          return {
            ...item,
            quantity: newQuantity,
            unitPrice: newUnitPrice,
            total: newQuantity * newUnitPrice,
          };
        }
        return item;
      });

      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    }),

  removeItem: (productId) =>
    set((state) => {
      const updatedItems = state.invoiceItems.filter((item) => item.productId !== productId);
      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);
      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    }),

  resetForm: () =>
    set({
      selectedCustomer: null,
      invoiceItems: [],
      totalAmount: 0,
    }),
}));