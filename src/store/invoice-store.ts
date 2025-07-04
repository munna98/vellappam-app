// src/store/invoice-store.ts
import { create } from 'zustand';
import { Customer, Product } from '@prisma/client';

// Define the shape of a line item in the invoice creation form
export interface InvoiceItem {
  productId: string;
  productName: string;
  productCode: string; // Add product code for display
  unitPrice: number;
  quantity: number;
  total: number;
}

// Define the state of our invoice form
interface InvoiceState {
  selectedCustomer: Customer | null;
  invoiceItems: InvoiceItem[];
  totalAmount: number;
}

// Define the actions to update the state
interface InvoiceActions {
  setCustomer: (customer: Customer | null) => void;
  addItem: (product: Product, quantity?: number) => void; // Action to add a product to the items list
  updateItemQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  resetForm: () => void;
}

// Combine state and actions into one type
type InvoiceStore = InvoiceState & InvoiceActions;

// Create the Zustand store
export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  // --- State ---
  selectedCustomer: null,
  invoiceItems: [],
  totalAmount: 0,

  // --- Actions ---
  setCustomer: (customer) => set({ selectedCustomer: customer }),

  addItem: (product, quantity = 1) => {
    set((state) => {
      // Find if the item already exists in the list
      const existingItem = state.invoiceItems.find(item => item.productId === product.id);
      
      let updatedItems: InvoiceItem[];
      
      if (existingItem) {
        // If it exists, update the quantity and total
        updatedItems = state.invoiceItems.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity, total: item.unitPrice * (item.quantity + quantity) }
            : item
        );
      } else {
        // If it's a new item, just add it
        const newItem: InvoiceItem = {
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          unitPrice: product.price,
          quantity: quantity,
          total: product.price * quantity,
        };
        updatedItems = [...state.invoiceItems, newItem];
      }

      // Recalculate the total amount for the entire invoice
      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    });
  },

  updateItemQuantity: (productId, quantity) => {
    set((state) => {
      let updatedItems: InvoiceItem[];

      if (quantity <= 0) {
        // If quantity is 0 or less, remove the item
        updatedItems = state.invoiceItems.filter(item => item.productId !== productId);
      } else {
        // Otherwise, update the quantity and total for the specific item
        updatedItems = state.invoiceItems.map(item =>
          item.productId === productId
            ? { ...item, quantity, total: item.unitPrice * quantity }
            : item
        );
      }
      
      // Recalculate the total amount for the entire invoice
      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    });
  },

  removeItem: (productId) => {
    set((state) => {
      const updatedItems = state.invoiceItems.filter(item => item.productId !== productId);
      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);
      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    });
  },

  resetForm: () => set({ selectedCustomer: null, invoiceItems: [], totalAmount: 0 }),
}));