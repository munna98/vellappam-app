// src/store/invoice-store.ts
import { create } from 'zustand';
import { Product, Customer } from '@prisma/client';

export interface InvoiceItem {
  productId: string;
  productName: string;
  productCode: string;
  unitPrice: number; // The price for this specific invoice item
  quantity: number;
  total: number; // unitPrice * quantity
}

interface InvoiceState {
  selectedCustomer: Customer | null;
  invoiceItems: InvoiceItem[];
  totalAmount: number;
  setCustomer: (customer: Customer | null) => void;
  // Modified: addItem now accepts an optional customUnitPrice
  addItem: (product: Product, quantity: number, customUnitPrice?: number) => void;
  // New: Flexible action to update quantity, unitPrice, or both
  updateItemDetails: (productId: string, newQuantity?: number, newUnitPrice?: number) => void;
  removeItem: (productId: string) => void;
  resetForm: () => void;
}

const calculateTotalAmount = (items: InvoiceItem[]): number => {
  return items.reduce((sum, item) => sum + item.total, 0);
};

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  selectedCustomer: null,
  invoiceItems: [],
  totalAmount: 0,

  setCustomer: (customer) => set({ selectedCustomer: customer }),

  addItem: (product, quantity, customUnitPrice) => {
    set((state) => {
      const existingItemIndex = state.invoiceItems.findIndex(
        (item) => item.productId === product.id
      );

      // Determine the price to use for the new item.
      // If customUnitPrice is provided, use it; otherwise, use the product's default price.
      const priceToUse = customUnitPrice !== undefined ? customUnitPrice : product.price;

      if (existingItemIndex > -1) {
        // If product already exists, update its quantity and recalculate total
        const updatedItems = state.invoiceItems.map((item, index) => {
          if (index === existingItemIndex) {
            const newQuantity = item.quantity + quantity;
            const newTotal = newQuantity * item.unitPrice; // Use existing unitPrice for calculation
            return { ...item, quantity: newQuantity, total: newTotal };
          }
          return item;
        });
        return {
          invoiceItems: updatedItems,
          totalAmount: calculateTotalAmount(updatedItems),
        };
      } else {
        // Add new item to the list
        const newItem: InvoiceItem = {
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          unitPrice: priceToUse, // Set the unit price for this invoice item
          quantity: quantity,
          total: priceToUse * quantity,
        };
        const updatedItems = [...state.invoiceItems, newItem];
        return {
          invoiceItems: updatedItems,
          totalAmount: calculateTotalAmount(updatedItems),
        };
      }
    });
  },

  updateItemDetails: (productId, newQuantity, newUnitPrice) => {
    set((state) => {
      const updatedItems = state.invoiceItems.map((item) => {
        if (item.productId === productId) {
          // Use provided new values, or fallback to current item values
          const quantity = newQuantity !== undefined ? newQuantity : item.quantity;
          const unitPrice = newUnitPrice !== undefined ? newUnitPrice : item.unitPrice;

          // Ensure quantity and unitPrice are not negative
          const safeQuantity = Math.max(0, quantity);
          const safeUnitPrice = Math.max(0, unitPrice);

          const newTotal = safeQuantity * safeUnitPrice;
          return { ...item, quantity: safeQuantity, unitPrice: safeUnitPrice, total: newTotal };
        }
        return item;
      });
      return {
        invoiceItems: updatedItems,
        totalAmount: calculateTotalAmount(updatedItems),
      };
    });
  },

  removeItem: (productId) => {
    set((state) => {
      const updatedItems = state.invoiceItems.filter(
        (item) => item.productId !== productId
      );
      return {
        invoiceItems: updatedItems,
        totalAmount: calculateTotalAmount(updatedItems),
      };
    });
  },

  resetForm: () =>
    set({
      selectedCustomer: null,
      invoiceItems: [],
      totalAmount: 0,
    }),
}));