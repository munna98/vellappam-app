// src/app/api/products/[id]/route.ts
import { NextResponse, NextRequest } from 'next/server'; // Import NextRequest
import prisma from '@/lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Helper to extract ID from the URL (re-use the same logic)
function extractId(request: NextRequest): string | null {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1] || null;
}

// GET /api/products/[id]
export async function GET(request: NextRequest) { // Changed signature: removed { params }
  const id = extractId(request); // Extract ID from request.url
  if (!id) return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });

  try {
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (error: unknown) { // Explicitly type error as unknown
    console.error(`Error fetching product ${id}:`, error); // Use id from extraction
    // Narrow down error type for a more specific message if needed
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch product';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// PUT /api/products/[id]
export async function PUT(request: NextRequest) { // Changed signature: removed { params }
  const id = extractId(request); // Extract ID from request.url
  if (!id) return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });

  try {
    const body = await request.json();
    const { name, code, price, unit } = body;

    if (!name || !code || typeof price === 'undefined' || !unit) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name,
        code,
        price: parseFloat(price),
        unit,
      },
    });
    return NextResponse.json(updatedProduct);
  } catch (error: unknown) { // Explicitly type error as unknown
    console.error(`Error updating product ${id}:`, error); // Use id from extraction
    // Properly type the error to check for Prisma specific errors
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002' && error.meta?.target && Array.isArray(error.meta.target) && error.meta.target.includes('code')) {
        return NextResponse.json({ error: 'Product code already exists.' }, { status: 409 });
      }
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to update product';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/products/[id]
export async function DELETE(request: NextRequest) { // Changed signature: removed { params }
  const id = extractId(request); // Extract ID from request.url
  if (!id) return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });

  try {
    // Check for associated invoice items before deleting
    const relatedInvoiceItems = await prisma.invoiceItem.count({
      where: { productId: id }, // Use id from extraction
    });

    if (relatedInvoiceItems > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product with associated invoice items.' },
        { status: 409 } // Conflict
      );
    }

    await prisma.product.delete({
      where: { id }, // Use id from extraction
    });
    return NextResponse.json({ message: 'Product deleted successfully' }, { status: 200 });
  } catch (error: unknown) { // Explicitly type error as unknown
    console.error(`Error deleting product ${id}:`, error); // Use id from extraction
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete product';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}