"use client";

import dynamic from "next/dynamic";

const SolanaProviderInner = dynamic(
  () => import("./solana-provider-inner").then((m) => m.SolanaProviderInner),
  { ssr: false }
);

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  return <SolanaProviderInner>{children}</SolanaProviderInner>;
}
