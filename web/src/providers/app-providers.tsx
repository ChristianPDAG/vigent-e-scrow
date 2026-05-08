"use client";

import { Toaster } from "sonner";
import { SolanaProvider } from "./solana-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      {children}
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "#11182D",
            border: "1px solid #263252",
            color: "#F5F7FF",
          },
        }}
      />
    </SolanaProvider>
  );
}
