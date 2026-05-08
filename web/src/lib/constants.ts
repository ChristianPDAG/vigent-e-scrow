export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as
  | "devnet"
  | "mainnet-beta"
  | "localnet";

export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const ESCROW_PROGRAM_ID =
  process.env.NEXT_PUBLIC_ESCROW_PROGRAM_ID ?? "";

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

export const RELEASE_SESSION_TTL_MINUTES = 10;

export const EXPLORER_BASE_URL = "https://explorer.solana.com";

export const SOL_DECIMALS = 9;
export const USDC_DECIMALS = 6;

export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
