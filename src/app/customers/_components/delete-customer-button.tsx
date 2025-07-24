// src/app/customers/_components/delete-customer-button.tsx
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

interface DeleteCustomerButtonProps {
  customerId: string;
  customerName: string;
  onDelete?: (deletedId: string) => void;
}

export function DeleteCustomerButton({
  customerId,
  customerName,
  onDelete
}: DeleteCustomerButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete customer');
      }

      toast.success(`Customer "${customerName}" deleted successfully!`);
      if (onDelete) {
        onDelete(customerId);
      }
    } catch (error) { // ⭐ Removed ': any'
      console.error('Error deleting customer:', error);
      // ⭐ Safely access message property
      toast.error((error as Error).message || 'Error deleting customer.');
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
            This action cannot be undone. This will permanently delete the customer{' '}
            <span className="font-semibold">{customerName}</span> and remove their data from our
            servers.
            <br />
            <br />
            **Note:** Customers with associated invoices or payments cannot be deleted.
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