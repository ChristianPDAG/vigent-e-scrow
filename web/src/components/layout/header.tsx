"use client";

import Image from "next/image";
import Link from "next/link";
import { WalletButton } from "./wallet-button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-base/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/app" className="flex items-center gap-2">
          <Image
            src="/logo.jpeg"
            alt="Vigent-E-Scrow logo"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover"
            priority
          />
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
