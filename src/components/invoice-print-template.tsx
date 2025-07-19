// src/components/invoice-print-template.tsx
import React from 'react';
import { CompanyInfo, Invoice, InvoiceItem, Product, Customer } from '@prisma/client';

// Extend InvoiceItem to include Product details for printing
type InvoiceItemWithProduct = InvoiceItem & {
  product: Product;
};

// Extend Invoice to include Customer and InvoiceItem with Product details
type InvoiceWithDetails = Invoice & {
  customer: Customer;
  items: InvoiceItemWithProduct[];
};

interface InvoicePrintTemplateProps {
  invoice: InvoiceWithDetails;
  companyInfo: CompanyInfo | null;
  customerOldBalance: number; // The customer's balance BEFORE this invoice was applied
  currentInvoiceBalanceDue: number; // The balance due for THIS specific invoice
}

const InvoicePrintTemplate: React.FC<InvoicePrintTemplateProps> = ({
  invoice,
  companyInfo,
  customerOldBalance,
  currentInvoiceBalanceDue,
}) => {
  const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const currentTime = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate the new total customer balance
  // This should be correct if customerOldBalance and currentInvoiceBalanceDue are correct.
  const customerNewTotalBalance = customerOldBalance + currentInvoiceBalanceDue;

  return (
    <>
      {/* Header */}
      <div className="header">
        {companyInfo?.businessName && <h2 className="font-bold text-center" style={{ fontSize: '12pt', marginBottom: '2mm' }}>{companyInfo.businessName}</h2>}
        {companyInfo?.address1 && <p className="text-sm text-center">{companyInfo.address1}</p>}
        {companyInfo?.mobile && <p className="text-sm text-center">Mobile: {companyInfo.mobile}</p>}
        <p className="text-sm text-center" style={{ marginTop: '3mm' }}>TAX INVOICE</p>
      </div>

      {/* Invoice Details */}
      <div className="invoice-details">
        <p className="text-sm">Invoice No: <span className="font-bold">{invoice.invoiceNumber}</span></p>
        <p className="text-sm">Date: {invoiceDate} {currentTime}</p>
        <p className="text-sm">Customer: <span className="font-bold">{invoice.customer.name}</span></p>
        {invoice.customer.mobile && <p className="text-sm">Cust. Mob: {invoice.customer.mobile}</p>}
      </div>

      {/* Items Table */}
      <div className="item-table">
        <table>
          <thead>
            <tr>
              <th className="text-left">Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Price</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product.name}</td>
                <td className="text-right">{item.quantity}</td>
                <td className="text-right">{item.unitPrice.toFixed(2)}</td>
                <td className="text-right">{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <div className="totals-section">
        <div>
          <span>Subtotal:</span>
          <span className="font-bold">₹{invoice.totalAmount.toFixed(2)}</span>
        </div>
        {invoice.discountAmount > 0 && (
          <div>
            <span>Discount:</span>
            <span className="font-bold">₹{invoice.discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div>
          <span>Net Amount:</span>
          <span className="font-bold">₹{invoice.netAmount.toFixed(2)}</span>
        </div>
        <div>
          <span>Paid Amount:</span>
          <span className="font-bold">₹{invoice.paidAmount.toFixed(2)}</span>
        </div>

        {/* --- Display Previous Balance only if it's not effectively zero --- */}
        {/* Using Math.abs for floating point tolerance, or simply checking for exactly 0 */}
        {Math.abs(customerOldBalance) > 0.005 && ( // Check if absolute value is greater than a very small epsilon
          <div>
            <span>Previous Balance:</span>
            <span className="font-bold">₹{customerOldBalance.toFixed(2)}</span>
          </div>
        )}

        <div>
          <span>Bill Balance Due:</span> {/* Balance for THIS bill */}
          <span className="font-bold">₹{currentInvoiceBalanceDue.toFixed(2)}</span>
        </div>
        <div className="grand-total">
          <span>Total Outstanding:</span> {/* Customer's new overall balance */}
          <span>₹{customerNewTotalBalance.toFixed(2)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="footer">
        <p className="text-sm text-center">Thank you for your business!</p>
        {invoice.notes && <p className="text-sm text-center" style={{ marginTop: '2mm' }}>Notes: {invoice.notes}</p>}
      </div>
    </>
  );
};

export default InvoicePrintTemplate;