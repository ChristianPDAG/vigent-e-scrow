import { Connection, clusterApiUrl } from "@solana/web3.js";
import { SOLANA_NETWORK, SOLANA_RPC_URL } from "./constants";

export function getConnection(): Connection {
  const endpoint =
    SOLANA_NETWORK === "localnet"
      ? "http://localhost:8899"
      : SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);
  return new Connection(endpoint, "confirmed");
}

export const connection = getConnection();
