// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/navbar";
import { Toaster } from "sonner";
import { Suspense } from 'react'; // ⭐ Import Suspense

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
 
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vellappam App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        <main className="container mx-auto px-4 md:px-6">
          {/* ⭐ Wrap children with Suspense here ⭐ */}
          <Suspense fallback={<div>Loading page...</div>}>
            {children}
          </Suspense>
        </main>
        <Toaster />
      </body>
    </html>
  );
}
