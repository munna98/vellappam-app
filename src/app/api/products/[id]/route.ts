// src/app/api/products/[id]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/products/[id]
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (error) {
    console.error(`Error fetching product ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// PUT /api/products/[id]
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, code, price, unit } = body;

    if (!name || !code || !price || !unit) {
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
  } catch (error: any) {
    console.error(`Error updating product ${params.id}:`, error);
    if (error.code === 'P2002' && error.meta?.target?.includes('code')) {
      return NextResponse.json({ error: 'Product code already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// DELETE /api/products/[id]
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    // Check for associated invoice items before deleting
    const relatedInvoiceItems = await prisma.invoiceItem.count({
      where: { productId: id },
    });

    if (relatedInvoiceItems > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product with associated invoice items.' },
        { status: 409 } // Conflict
      );
    }

    await prisma.product.delete({
      where: { id },
    });
    return NextResponse.json({ message: 'Product deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting product ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}