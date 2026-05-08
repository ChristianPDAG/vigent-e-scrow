"use client";

import Link from "next/link";
import { WalletButton } from "./wallet-button";
import { QrCode } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-base/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/app" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 border border-primary/30">
            <QrCode className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-text-main">
            Vigent-E-Scrow
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-text-secondary">
          <Link href="/app" className="hover:text-text-main transition-colors">
            Dashboard
          </Link>
          <Link href="/app/create" className="hover:text-text-main transition-colors">
            New Escrow
          </Link>
          <Link href="/app/scan" className="hover:text-text-main transition-colors">
            Scan QR
          </Link>
        </nav>

        <WalletButton />
      </div>
    </header>
  );
}
