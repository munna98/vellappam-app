// src/app/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CompanyInfo } from '@prisma/client';
import { Checkbox } from '@/components/ui/checkbox'; // Import Checkbox

export default function SettingsPage() {
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    id: '', // Initialize with empty string or null as per your Prisma setup
    businessName: '',
    address1: null,
    address2: null,
    city: null,
    state: null,
    zipCode: null,
    country: null,
    phone: null,
    mobile: null,
    email: null,
    website: null,
    logoUrl: null,
    gstin: null,
    bankName: null,
    bankAccountNo: null,
    ifscCode: null,
    upiId: null,
    defaultPrintOnSave: true, // Initialize to true as per schema default
    createdAt: new Date(), // Dummy date
    updatedAt: new Date(), // Dummy date
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        const response = await fetch('/api/company-info');
        if (!response.ok) {
          throw new Error('Failed to fetch company info');
        }
        const data: CompanyInfo = await response.json();
        setCompanyInfo(data);
      } catch (error) {
        console.error('Error fetching company info:', error);
        toast.error('Failed to load company settings.');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyInfo();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setCompanyInfo((prev) => ({ ...prev, [id]: value }));
  };

  const handleCheckboxChange = (checked: boolean) => {
    setCompanyInfo((prev) => ({ ...prev, defaultPrintOnSave: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/company-info', {
        method: 'POST', // or PUT if you change the API route
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(companyInfo),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      toast.success('Company settings saved successfully!');
    } catch (error) {
      console.error('Error saving company info:', error);
      toast.error(`Failed to save settings: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto py-10 text-center">Loading settings...</div>;
  }

  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Company Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  value={companyInfo.businessName || ''}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <Label htmlFor="mobile">Mobile Number</Label>
                <Input
                  id="mobile"
                  value={companyInfo.mobile || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="address1">Address Line 1</Label>
                <Input
                  id="address1"
                  value={companyInfo.address1 || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="address2">Address Line 2</Label>
                <Input
                  id="address2"
                  value={companyInfo.address2 || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={companyInfo.city || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={companyInfo.state || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="zipCode">Zip Code</Label>
                <Input
                  id="zipCode"
                  value={companyInfo.zipCode || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={companyInfo.country || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={companyInfo.phone || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={companyInfo.email || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={companyInfo.website || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="gstin">GSTIN</Label>
                <Input
                  id="gstin"
                  value={companyInfo.gstin || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={companyInfo.bankName || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="bankAccountNo">Bank Account No.</Label>
                <Input
                  id="bankAccountNo"
                  value={companyInfo.bankAccountNo || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="ifscCode">IFSC Code</Label>
                <Input
                  id="ifscCode"
                  value={companyInfo.ifscCode || ''}
                  onChange={handleChange}
                />
              </div>
              <div>
                <Label htmlFor="upiId">UPI ID</Label>
                <Input
                  id="upiId"
                  value={companyInfo.upiId || ''}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* New checkbox for default print behavior */}
            <div className="flex items-center space-x-2 mt-6">
              <Checkbox
                id="defaultPrintOnSave"
                checked={companyInfo.defaultPrintOnSave ?? true} // Use ?? true for initial render safety
                onCheckedChange={handleCheckboxChange}
              />
              <label
                htmlFor="defaultPrintOnSave"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Enable print invoice by default when saving
              </label>
            </div>

            <Button type="submit" className="mt-6" disabled={loading}>
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}