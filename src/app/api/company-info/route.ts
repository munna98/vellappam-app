// src/app/api/company-info/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/company-info
export async function GET() {
  try {
    const companyInfo = await prisma.companyInfo.findFirst();
    if (!companyInfo) {
      // Return a default structure if no info exists, might be useful for initial setup
      return NextResponse.json({
        id: null,
        businessName: '',
        address1: '',
        address2: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        phone: '',
        mobile: '',
        email: '',
        website: '',
        logoUrl: '',
        gstin: '',
        bankName: '',
        bankAccountNo: '',
        ifscCode: '',
        upiId: '',
        defaultPrintOnSave: true, // Default value for new fetches
      });
    }
    return NextResponse.json(companyInfo);
  } catch (error) {
    console.error('Error fetching company info:', error);
    return NextResponse.json({ error: 'Failed to fetch company info' }, { status: 500 });
  }
}

// POST or PUT /api/company-info (handle both create and update)
export async function POST(request: Request) { // Could be PUT /api/company-info/1 to be RESTful
  try {
    const data = await request.json();
    const {
      id, // Include ID if it's an update, null for create
      businessName,
      address1,
      address2,
      city,
      state,
      zipCode,
      country,
      phone,
      mobile,
      email,
      website,
      logoUrl,
      gstin,
      bankName,
      bankAccountNo,
      ifscCode,
      upiId,
      defaultPrintOnSave, // New field to handle
    } = data;

    if (!businessName) {
      return NextResponse.json({ error: 'Business Name is required.' }, { status: 400 });
    }

    let companyInfo;
    if (id) {
      // Update existing
      companyInfo = await prisma.companyInfo.update({
        where: { id: id },
        data: {
          businessName,
          address1,
          address2,
          city,
          state,
          zipCode,
          country,
          phone,
          mobile,
          email,
          website,
          logoUrl,
          gstin,
          bankName,
          bankAccountNo,
          ifscCode,
          upiId,
          defaultPrintOnSave, // Save the new field
        },
      });
    } else {
      // Create new
      companyInfo = await prisma.companyInfo.create({
        data: {
          businessName,
          address1,
          address2,
          city,
          state,
          zipCode,
          country,
          phone,
          mobile,
          email,
          website,
          logoUrl,
          gstin,
          bankName,
          bankAccountNo,
          ifscCode,
          upiId,
          defaultPrintOnSave, // Save the new field
        },
      });
    }

    return NextResponse.json(companyInfo);
  } catch (error) {
    console.error('Error saving company info:', error);
    return NextResponse.json({ error: 'Failed to save company info', details: (error as Error).message }, { status: 500 });
  }
}