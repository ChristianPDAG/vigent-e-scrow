// @ts-nocheck
/**
 * audit-devnet.ts — Auditoría on-chain del contrato escrow
 *
 * Muestra el estado completo de todos los escrows del programa:
 * - Config del protocolo (fees, treasury, arbiter)
 * - Listado completo de escrow accounts con estado y balances
 * - Resumen de fondos bloqueados por estado
 *
 * Uso: npx ts-node scripts/audit-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";
import { PublicKey, LAMPORTS_PER_SOL, Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// CONFIG
// ============================================================

const DEVNET_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("bzopvkvUsqbUCy47wWmkvR53U2GecG9ZJD7yQg3cDtp");
const PROJECT_ROOT = path.resolve(__dirname, "..");
const WALLET_PATH = path.join(PROJECT_ROOT, "target", "wallet", "wallet.json");
const DEPLOY_INFO_PATH = path.join(PROJECT_ROOT, "target", "deploy_info.json");
const IDL_PATH = path.join(PROJECT_ROOT, "target", "idl", "workspace.json");

const EXPLORER_ACCT = "https://explorer.solana.com/address";

// ============================================================
// UTILIDADES
// ============================================================

const fmt6 = (n: bigint | number) => (Number(n) / 1e6).toFixed(6);
const short = (pk: PublicKey | string) => {
  const s = pk.toString();
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
};
const explorerAccount = (pk: PublicKey | string) =>
  `${EXPLORER_ACCT}/${pk.toString()}?cluster=devnet`;

function loadWallet(): Keypair {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error(
      `Wallet no encontrado: ${WALLET_PATH}\nEjecuta: npx ts-node scripts/init_devnet.ts`
    );
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8")))
  );
}

function loadDeployInfo() {
  if (!fs.existsSync(DEPLOY_INFO_PATH)) {
    throw new Error(
      `deploy_info.json no encontrado.\nEjecuta: npx ts-node scripts/init_devnet.ts`
    );
  }
  return JSON.parse(fs.readFileSync(DEPLOY_INFO_PATH, "utf-8"));
}

function loadIdl() {
  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(`IDL no encontrado: ${IDL_PATH}\nEjecuta: anchor build`);
  }
  return JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
}

function extractStatus(status: any): string {
  if (!status) return "unknown";
  const key = Object.keys(status)[0];
  return key || JSON.stringify(status);
}

function statusIcon(status: string): string {
  const icons: Record<string, string> = {
    created: "🟡",
    funded: "🟢",
    releaseStarted: "🔵",
    released: "✅",
    cancelled: "⬜",
    disputed: "🔴",
    expired: "⏰",
  };
  return icons[status] || "❓";
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   Vigent Escrow — Auditoría On-Chain         ║");
  console.log(`║   ${new Date().toISOString().padEnd(43)}║`);
  console.log("╚══════════════════════════════════════════════╝");

  // Cargar configuración
  const adminKp = loadWallet();
  const deployInfo = loadDeployInfo();
  const idl = loadIdl();
  const configPDA = new PublicKey(deployInfo.configPDA);

  console.log(`\n🔑 Admin:      ${adminKp.publicKey.toBase58()}`);
  console.log(`📍 Config PDA: ${configPDA.toBase58()}`);

  // Configurar provider
  const connection = new Connection(DEVNET_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(adminKp), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  // ============================================================
  // CONFIG DEL PROTOCOLO
  // ============================================================

  console.log("\n══════════════════════════════════════════════");
  console.log("  CONFIG DEL PROTOCOLO");
  console.log("══════════════════════════════════════════════");

  let config: any;
  try {
    config = await program.account.config.fetch(configPDA);
    console.log(`  Authority:     ${config.authority.toBase58()}`);
    console.log(`  Fee:           ${config.feeBps} bps (${(config.feeBps / 100).toFixed(2)}%)`);
    console.log(`  Treasury:      ${config.treasury.toBase58()}`);
    console.log(`  Arbiter:       ${config.arbiter.toBase58()}`);
    console.log(`  Activo:        ${config.isActive}`);
    console.log(`  Pausado:       ${config.isPaused}`);
    console.log(`  Version:       ${config.version}`);
    console.log(`  Escrow Count:  ${config.escrowCount.toString()}`);
    console.log(`  🔗 ${explorerAccount(configPDA)}`);
  } catch (err: any) {
    console.log(`  ❌ Config no encontrado: ${err.message}`);
    console.log("  Ejecuta: npx ts-node scripts/init_devnet.ts");
  }

  // Balance SOL del admin
  const solBalance = await connection.getBalance(adminKp.publicKey);
  console.log(`\n  💰 Admin SOL:  ${(solBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // ============================================================
  // TODOS LOS ESCROWS DEL PROGRAMA
  // ============================================================

  console.log("\n══════════════════════════════════════════════");
  console.log("  ESCROW ACCOUNTS (todos)");
  console.log("══════════════════════════════════════════════");

  const escrows = await program.account.escrowAccount.all();
  console.log(`  Total encontrados: ${escrows.length}\n`);

  if (escrows.length === 0) {
    console.log("  (sin escrows en este programa)\n");
    return;
  }

  // Counters para el resumen
  const statusCounts: Record<string, number> = {};
  const statusLocked: Record<string, bigint> = {};
  let totalLocked = BigInt(0);
  let totalVolume = BigInt(0);

  // Ordenar por escrowId ascendente
  escrows.sort((a: any, b: any) => {
    const idA = a.account.escrowId.toNumber();
    const idB = b.account.escrowId.toNumber();
    return idA - idB;
  });

  for (const { publicKey, account } of escrows) {
    const status = extractStatus(account.status);
    const icon = statusIcon(status);

    // Contar escrows por status
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    totalVolume += BigInt(account.amount.toString());

    // Obtener balance del vault
    let vaultBalance = BigInt(0);
    let vaultStr = "N/A";
    try {
      const vaultInfo = await getAccount(connection, account.vault);
      vaultBalance = vaultInfo.amount;
      vaultStr = `${fmt6(vaultBalance)} USDC`;
    } catch {
      vaultStr = "0.000000 USDC (vaciado)";
    }

    // Acumular locked si hay fondos en vault
    if (vaultBalance > BigInt(0)) {
      totalLocked += vaultBalance;
      statusLocked[status] = (statusLocked[status] || BigInt(0)) + vaultBalance;
    }

    // Calcular días hasta vencimiento
    const now = Math.floor(Date.now() / 1000);
    const expiresTs = account.expiresAt.toNumber();
    const diffSec = expiresTs - now;
    const expiryStr =
      diffSec > 0
        ? `${Math.floor(diffSec / 3600)}h ${Math.floor((diffSec % 3600) / 60)}m`
        : "EXPIRADO";

    // Mostrar escrow
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  ${icon} Escrow #${account.escrowId.toString()} | ${status.toUpperCase()}`);
    console.log(`     PDA:       ${short(publicKey)}`);
    console.log(`     Depositor: ${short(account.depositor)}`);
    console.log(`     Receiver:  ${short(account.receiver)}`);
    console.log(`     Mint:      ${short(account.mint)}`);
    console.log(`     Amount:    ${fmt6(account.amount.toString())} USDC`);
    console.log(`     Vault:     ${vaultStr}`);
    console.log(`     Expira en: ${expiryStr}`);

    if (status === "releaseStarted") {
      console.log(`     Dep. confirmó:  ${account.depositorReleased}`);
      console.log(`     Recv. confirmó: ${account.receiverReleased}`);
      const sessionDiff = account.sessionExpiresAt.toNumber() - now;
      const sessionStr =
        sessionDiff > 0
          ? `${Math.floor(sessionDiff / 60)}m ${sessionDiff % 60}s`
          : "EXPIRADA";
      console.log(`     Sesión QR:      ${sessionStr}`);
    }

    if (account.disputeReason > 0) {
      const reasons: Record<number, string> = {
        1: "Fondos no recibidos",
        2: "Servicio no prestado",
        3: "Fraude reportado",
      };
      const reasonStr = reasons[account.disputeReason] || `Reason ${account.disputeReason}`;
      console.log(`     Disputa:   ${account.disputeReason} — ${reasonStr}`);
    }

    console.log(`     🔗 ${explorerAccount(publicKey)}`);
  }

  // ============================================================
  // RESUMEN FINAL
  // ============================================================

  console.log("\n══════════════════════════════════════════════");
  console.log("  RESUMEN");
  console.log("══════════════════════════════════════════════");
  console.log(`  Total escrows:      ${escrows.length}`);
  console.log(`  Volumen total:      ${fmt6(totalVolume)} USDC`);
  console.log(`  Fondos bloqueados:  ${fmt6(totalLocked)} USDC\n`);
  console.log("  Por estado:");

  const statusOrder = ["created", "funded", "releaseStarted", "released", "disputed", "cancelled", "expired"];
  for (const s of statusOrder) {
    if (statusCounts[s]) {
      const icon = statusIcon(s);
      const count = statusCounts[s].toString().padStart(3);
      const locked = statusLocked[s] ? ` | bloqueado: ${fmt6(statusLocked[s])} USDC` : "";
      console.log(`  ${icon} ${s.padEnd(16)} ${count}${locked}`);
    }
  }

  console.log(`\n  Programa: ${PROGRAM_ID.toBase58()}`);
  console.log(`  🔗 ${EXPLORER_ACCT}/${PROGRAM_ID.toBase58()}?cluster=devnet\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err: any) => {
    console.error("\n❌ Error:", err.message);
    if (err.logs) console.error("Logs:", err.logs);
    process.exit(1);
  });
