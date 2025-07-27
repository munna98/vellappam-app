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
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Menu,
  Package2,
  DollarSign,
  Users,
  Briefcase,
  ReceiptText,
  Settings,
  FileText,
  ChevronDown,
  Calendar,
} from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const pathname = usePathname();
  const [reportsExpanded, setReportsExpanded] = useState(false);

  const navItems = [
    { name: "Dashboard", href: "/", icon: Briefcase },
    { name: "Customers", href: "/customers", icon: Users },
    { name: "Products", href: "/products", icon: Package2 },
    { name: "Invoices", href: "/invoices", icon: DollarSign },
    { name: "Payments", href: "/payments", icon: ReceiptText },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  const reportItems = [
    { name: "Day Report", href: "/reports/day", icon: Calendar },
    // Add more report types here as needed
    // { name: "Weekly Report", href: "/reports/weekly", icon: Calendar },
    // { name: "Monthly Report", href: "/reports/monthly", icon: Calendar },
  ];

  const isReportsActive = pathname.startsWith("/reports");

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
          
          {/* Reports Dropdown for Desktop */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "h-auto p-0 text-sm font-medium transition-colors hover:text-foreground/80",
                  isReportsActive ? "text-foreground" : "text-foreground/60"
                )}
              >
                Reports
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {reportItems.map((item) => (
                <DropdownMenuItem key={item.name} asChild>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 w-full"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
                <SheetTitle className="sr-only">Mobile Navigation</SheetTitle>
              </SheetHeader>
              <nav className="grid gap-2 text-lg font-medium pt-4">
                <Link
                  href="/"
                  className="flex items-center gap-2 font-semibold mb-4"
                >
                  <Package2 className="h-6 w-6" />
                  <span className="font-bold text-lg">Vellappam App</span>
                </Link>
                <Separator />
                
                {navItems.map((item) => (
                  <SheetClose asChild key={item.name}>
                    <Link
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
                  </SheetClose>
                ))}

                {/* Reports Section for Mobile */}
                <div>
                  <button
                    onClick={() => setReportsExpanded(!reportsExpanded)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 transition-all hover:bg-muted",
                      isReportsActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5" />
                      Reports
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        reportsExpanded ? "rotate-180" : ""
                      )}
                    />
                  </button>
                  
                  {reportsExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {reportItems.map((item) => (
                        <SheetClose asChild key={item.name}>
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-muted text-sm",
                              pathname === item.href
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.name}
                          </Link>
                        </SheetClose>
                      ))}
                    </div>
                  )}
                </div>
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