// src/components/navbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Menu,
  Package2,
  DollarSign,
  Users,
  Briefcase,
  ReceiptText,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/", icon: Briefcase },
    { name: "Customers", href: "/customers", icon: Users },
    { name: "Products", href: "/products", icon: Package2 },
    { name: "Invoices", href: "/invoices", icon: DollarSign },
    { name: "Payments", href: "/payments", icon: ReceiptText },
    { name: "Settings", href: "/settings", icon: ReceiptText },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-lg">
      <div className="container flex h-16 items-center px-4 md:px-6">
        {/* Desktop Navigation */}
        <nav className="hidden md:flex flex-1 items-center gap-6 text-sm font-medium">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Package2 className="h-6 w-6" />
            <span className="sr-only">Vellappam App</span>
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "transition-colors hover:text-foreground/80",
                pathname === item.href
                  ? "text-foreground"
                  : "text-foreground/60"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Mobile Navigation */}
        <div className="flex md:hidden flex-1">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <nav className="grid gap-6 text-lg font-medium pt-4">
                <Link
                  href="/"
                  className="flex items-center gap-2 font-semibold mb-4"
                >
                  <Package2 className="h-6 w-6" />
                  <span className="font-bold text-lg">Vellappam App</span>
                </Link>
                <Separator />
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-muted",
                      pathname === item.href
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
        {/* Placeholder for future user/profile menu */}
        <div className="flex items-center gap-4 ml-auto">
          {/* This is where you can add a user avatar, profile menu, etc. */}
        </div>
      </div>
    </header>
  );
}
