// src/app/invoices/_components/delete-invoice-button.tsx
'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface DeleteInvoiceButtonProps {
  invoiceId: string;
  invoiceNumber: string;
  onDelete?: (deletedId: string) => void; // Add this prop
}

export function DeleteInvoiceButton({ invoiceId, invoiceNumber, onDelete }: DeleteInvoiceButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        // ⭐ FIX: Explicitly check if errorData.error is a string before using, otherwise provide fallback
        throw new Error(typeof errorData.error === 'string' ? errorData.error : 'Failed to delete invoice');
      }

      toast.success(`Invoice "${invoiceNumber}" deleted successfully!`);
      if (onDelete) {
        onDelete(invoiceId);
      }
    } catch (error: unknown) { // ⭐ FIX: Use 'unknown' for caught error
      console.error('Error deleting invoice:', error);
      // ⭐ FIX: Narrow error type and provide a more robust error message
      toast.error((error instanceof Error ? error.message : 'An unknown error occurred during deletion.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="h-8 w-8 p-0" disabled={isLoading}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete invoice{' '}
            <span className="font-semibold">{invoiceNumber}</span>, its associated items, and adjust the customer balance.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isLoading}>
            {isLoading ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}