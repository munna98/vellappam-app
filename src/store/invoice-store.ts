// src/store/invoice-store.ts
import { create } from 'zustand';
import { Product, Customer } from '@prisma/client'; // Import Product and Customer from Prisma client
import { FullInvoiceItem } from '@/types'; // Import FullInvoiceItem from your types

// Define the shape of an item in our store
// Added 'id' to reflect items coming from an existing invoice
interface InvoiceItem {
  id?: string; // Optional for new items, required for existing items
  productId: string;
  productCode: string;
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
  discountAmount: number; // Add discountAmount to the store
  paidAmount: number;     // Add paidAmount to the store
  notes: string;          // Add notes to the store

  setCustomer: (customer: Customer | null) => void;
  addItem: (product: Product, quantity: number, unitPrice: number) => void;
  updateItemDetails: (tempItemId: string | undefined, productId: string, quantity?: number, unitPrice?: number) => void; // Modified to accept temporary ID for new items
  removeItem: (itemId: string) => void; // This will now accept the actual ID or temporary ID
  setDiscountAmount: (amount: number) => void; // New action
  setPaidAmount: (amount: number) => void;     // New action
  setNotes: (notes: string) => void;            // New action
  
  // New action to load an existing invoice into the store
  loadInvoice: (invoice: { customer: Customer, items: FullInvoiceItem[], discountAmount: number, paidAmount: number, notes: string | null }) => void;
  resetForm: () => void;
}

export const useInvoiceStore = create<InvoiceStore>((set) => ({
  selectedCustomer: null,
  invoiceItems: [],
  totalAmount: 0,
  discountAmount: 0, // Initialize
  paidAmount: 0,     // Initialize
  notes: '',         // Initialize

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
        // Otherwise, add as a new item (assign a temporary ID for new items not yet saved)
        updatedItems = [
          ...state.invoiceItems,
          {
            id: crypto.randomUUID(), // ⭐ Generate a temporary ID for new items
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            quantity: quantity,
            unitPrice: unitPrice,
            total: quantity * unitPrice,
          },
        ];
      }

      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    }),

  updateItemDetails: (tempItemId, productId, quantity, unitPrice) =>
    set((state) => {
      const updatedItems = state.invoiceItems.map((item) => {
        // Find by product ID, but also check the temporary ID for new items
        if (item.productId === productId && (item.id === tempItemId || !tempItemId)) {
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

  removeItem: (itemId) =>
    set((state) => {
      const updatedItems = state.invoiceItems.filter((item) => item.id !== itemId);
      const newTotalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);
      return {
        invoiceItems: updatedItems,
        totalAmount: newTotalAmount,
      };
    }),

  setDiscountAmount: (amount) => set({ discountAmount: amount }),
  setPaidAmount: (amount) => set({ paidAmount: amount }),
  setNotes: (notes) => set({ notes: notes }),

  loadInvoice: (invoice) => {
    const loadedItems: InvoiceItem[] = invoice.items.map((item) => ({
      id: item.id, // Existing items already have an ID
      productId: item.productId,
      productCode: item.product?.code || 'N/A', // Assuming product is always included
      productName: item.product?.name || 'Unknown Product',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    }));

    const calculatedTotalAmount = loadedItems.reduce((sum, item) => sum + item.total, 0);

    set({
      selectedCustomer: invoice.customer,
      invoiceItems: loadedItems,
      totalAmount: calculatedTotalAmount,
      discountAmount: invoice.discountAmount,
      paidAmount: invoice.paidAmount,
      notes: invoice.notes || '',
    });
  },

  resetForm: () =>
    set({
      selectedCustomer: null,
      invoiceItems: [],
      totalAmount: 0,
      discountAmount: 0,
      paidAmount: 0,
      notes: '',
    }),
}));