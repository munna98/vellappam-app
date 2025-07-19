// src/lib/print-utils.ts

import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

interface PrintOptions {
  title?: string;
  styles?: string[]; // Array of CSS file URLs or inline styles
  printDelay?: number; // Delay before calling print() in ms
}

/**
 * Opens a new window, injects React content as static HTML, and triggers print.
 * @param Component The React component to render (e.g., <InvoicePrintTemplate data={...} />)
 * @param options Print options including title, styles, and delay.
 */
export const printReactComponent = (Component: React.ReactElement, options?: PrintOptions) => {
  const { title = 'Print Document', styles = [], printDelay = 500 } = options || {};

  // Render the React component to static HTML string
  const componentHtml = renderToStaticMarkup(Component);

  // Create a full HTML document for the print window
  const printHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      ${styles.map(style => {
        if (style.startsWith('http') || style.startsWith('/')) {
          return `<link rel="stylesheet" href="${style}">`;
        } else {
          return `<style>${style}</style>`; // Assume inline CSS
        }
      }).join('\n')}
      <style>
        /* Thermal Printer Specific Styles (3-inch / 80mm) */
        @page {
          size: 80mm auto; /* Width: 80mm, Height: auto */
          margin: 0; /* Remove default margins */
        }
        body {
          width: 80mm; /* Ensure content fits 80mm */
          margin: 0;
          padding: 5mm; /* Small padding for content */
          font-family: 'monospace', 'Courier New', monospace; /* Monospace font for receipts */
          font-size: 9pt; /* Small font size */
          line-height: 1.2;
          color: #000;
        }
        * {
          box-sizing: border-box;
        }
        .print-container {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .header, .footer {
          width: 100%;
          padding-bottom: 5mm;
          border-bottom: 1px dashed #000;
          margin-bottom: 5mm;
        }
        .footer {
          border-top: 1px dashed #000;
          border-bottom: none;
          padding-top: 5mm;
          margin-top: 5mm;
        }
        .invoice-details, .item-table {
          width: 100%;
          text-align: left;
          margin-bottom: 5mm;
        }
        .item-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8pt;
        }
        .item-table th, .item-table td {
          padding: 1mm 0;
          vertical-align: top;
        }
        .item-table th {
          border-bottom: 1px dashed #000;
          font-weight: bold;
        }
        .item-table td:nth-child(1) { width: 50%; } /* Item Name */
        .item-table td:nth-child(2) { width: 15%; text-align: right; } /* Qty */
        .item-table td:nth-child(3) { width: 15%; text-align: right; } /* Price */
        .item-table td:nth-child(4) { width: 20%; text-align: right; } /* Total */

        .totals-section {
          width: 100%;
          text-align: right;
          margin-top: 5mm;
          border-top: 1px dashed #000;
          padding-top: 5mm;
        }
        .totals-section div {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2mm;
        }
        .totals-section .grand-total {
          font-size: 11pt;
          font-weight: bold;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .text-sm { font-size: 8pt; }
      </style>
    </head>
    <body>
      <div class="print-container">
        ${componentHtml}
      </div>
      <script>
        // Use a delay to ensure all content and styles are rendered before printing
        setTimeout(() => {
          window.print();
          window.close(); // Close the print window after printing (optional)
        }, ${printDelay});
      </script>
    </body>
    </html>
  `;

  // Open a new window and write the HTML content
  const printWindow = window.open('', '_blank', 'width=300,height=600,resizable=yes,scrollbars=yes');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
  } else {
    alert('Could not open print window. Please allow pop-ups for this site.');
  }
};