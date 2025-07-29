// // src/app/api/invoices/next-number/route.ts
// import { NextResponse } from 'next/server';
// import { generateNextInvoiceNumber } from '@/lib/invoice-utils'; // Import the new utility

// export async function GET() {
//   try {
//     const nextNumber = await generateNextInvoiceNumber();
//     return NextResponse.json({ nextNumber });
//   } catch (error) {
//     console.error('Error generating next invoice number:', error);
//     return NextResponse.json({ error: 'Failed to generate next invoice number' }, { status: 500 });
//   }
// }